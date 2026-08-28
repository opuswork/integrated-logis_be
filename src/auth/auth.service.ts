import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { MessageNotReceivedError, SolapiMessageService } from 'solapi';

import {
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
  verifyPassword,
} from '../common/member-auth';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import type { AuthUserPayload, JwtPayload } from './jwt.strategy';
import {
  isSuperAdminUser,
  toAdminRegion,
  toAppRole,
} from './jwt.strategy';

const SMS_OTP_TTL_MS = 3 * 60 * 1000;
const SMS_VERIFIED_TTL_MS = 10 * 60 * 1000;
const SMS_RESEND_COOLDOWN_MS = 60 * 1000;
const SMS_MAX_ATTEMPTS = 5;

const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_VERIFIED_TTL_MS = 30 * 60 * 1000;
const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
const EMAIL_MAX_ATTEMPTS = 5;

type OtpEntry = {
  code: string;
  attempts: number;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async sendSmsCode(phone: string) {
    const normalizedPhone = this.assertValidMobilePhone(phone);
    const cooldownKey = this.smsCooldownKey(normalizedPhone);

    if (await this.cache.get<number>(cooldownKey)) {
      throw new BadRequestException(
        '잠시 후 다시 인증번호를 요청해 주세요.',
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const otpKey = this.smsOtpKey(normalizedPhone);

    // Send first so a Solapi failure does not leave a cooldown / unused OTP.
    await this.dispatchSms(normalizedPhone, code);

    await this.cache.set(
      otpKey,
      { code, attempts: 0 } satisfies OtpEntry,
      SMS_OTP_TTL_MS,
    );
    await this.cache.set(cooldownKey, Date.now(), SMS_RESEND_COOLDOWN_MS);

    return {
      message: '인증번호가 발송되었습니다.',
      expiresInSeconds: SMS_OTP_TTL_MS / 1000,
    };
  }

  async verifySmsCode(phone: string, code: string) {
    const normalizedPhone = this.assertValidMobilePhone(phone);
    const otpKey = this.smsOtpKey(normalizedPhone);
    const entry = await this.cache.get<OtpEntry>(otpKey);

    if (!entry) {
      throw new BadRequestException(
        '인증번호가 만료되었거나 존재하지 않습니다. 다시 발송해 주세요.',
      );
    }

    if (entry.attempts >= SMS_MAX_ATTEMPTS) {
      await this.cache.del(otpKey);
      throw new BadRequestException(
        '인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송해 주세요.',
      );
    }

    if (entry.code !== code.trim()) {
      await this.cache.set(
        otpKey,
        { code: entry.code, attempts: entry.attempts + 1 },
        SMS_OTP_TTL_MS,
      );
      throw new BadRequestException('인증번호가 일치하지 않습니다.');
    }

    await this.cache.del(otpKey);
    await this.cache.set(
      this.smsVerifiedKey(normalizedPhone),
      true,
      SMS_VERIFIED_TTL_MS,
    );

    return {
      message: '휴대폰 인증이 완료되었습니다.',
      verified: true,
    };
  }

  async sendEmailCode(email: string) {
    const normalizedEmail = this.assertValidEmail(email);
    const cooldownKey = this.emailCooldownKey(normalizedEmail);

    if (await this.cache.get<number>(cooldownKey)) {
      throw new BadRequestException(
        '잠시 후 다시 인증번호를 요청해 주세요.',
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const otpKey = this.emailOtpKey(normalizedEmail);

    await this.cache.set(
      otpKey,
      { code, attempts: 0 } satisfies OtpEntry,
      EMAIL_OTP_TTL_MS,
    );
    await this.cache.set(cooldownKey, Date.now(), EMAIL_RESEND_COOLDOWN_MS);

    await this.dispatchEmail(normalizedEmail, code);

    return {
      message: '이메일로 인증번호가 발송되었습니다.',
      expiresInSeconds: EMAIL_OTP_TTL_MS / 1000,
    };
  }

  async verifyEmailCode(email: string, code: string) {
    const normalizedEmail = this.assertValidEmail(email);
    const otpKey = this.emailOtpKey(normalizedEmail);
    const entry = await this.cache.get<OtpEntry>(otpKey);

    if (!entry) {
      throw new BadRequestException(
        '인증번호가 만료되었거나 존재하지 않습니다. 다시 발송해 주세요.',
      );
    }

    if (entry.attempts >= EMAIL_MAX_ATTEMPTS) {
      await this.cache.del(otpKey);
      throw new BadRequestException(
        '인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송해 주세요.',
      );
    }

    if (entry.code !== code.trim()) {
      await this.cache.set(
        otpKey,
        { code: entry.code, attempts: entry.attempts + 1 },
        EMAIL_OTP_TTL_MS,
      );
      throw new BadRequestException('인증번호가 일치하지 않습니다.');
    }

    await this.cache.del(otpKey);
    await this.cache.set(
      this.emailVerifiedKey(normalizedEmail),
      true,
      EMAIL_VERIFIED_TTL_MS,
    );

    return {
      message: '이메일 인증이 완료되었습니다.',
      verified: true,
    };
  }

  async login(dto: LoginDto) {
    const username = normalizeUsername(dto.username ?? '');
    const password = dto.password ?? '';

    if (!username || !password) {
      throw new BadRequestException('아이디와 비밀번호를 입력해 주세요.');
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { username },
        select: {
          id: true,
          username: true,
          password: true,
          fullname: true,
          phone: true,
          role: true,
          adminRegion: true,
          canApproveGreeting: true,
        },
      });

      const passwordValid =
        !!user && (await verifyPassword(password, user.password));

      if (!user || !passwordValid) {
        throw new UnauthorizedException(
          '아이디 또는 비밀번호가 올바르지 않습니다.',
        );
      }

      const bumped = await this.prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
        select: { sessionVersion: true },
      });

      const role = toAppRole(user.role);
      const adminRegion = toAdminRegion(user.adminRegion);
      const payload: JwtPayload = {
        sub: user.id,
        username: user.username,
        role,
        adminRegion,
        sv: bumped.sessionVersion,
      };

      return {
        message: '로그인되었습니다.',
        accessToken: await this.jwtService.signAsync(payload),
        user: {
          id: user.id,
          username: user.username,
          name: user.fullname,
          phone: user.phone,
          role,
          adminRegion,
          isSuperAdmin: isSuperAdminUser({ role, adminRegion }),
          canApproveGreeting: user.canApproveGreeting === true,
        },
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      console.error('login failed:', error);
      throw new InternalServerErrorException(
        '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  async me(currentUser: AuthUserPayload) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: currentUser.id },
        select: {
          id: true,
          username: true,
          fullname: true,
          phone: true,
          email: true,
          role: true,
          adminRegion: true,
          canApproveGreeting: true,
          churchId: true,
          church: {
            select: {
              id: true,
              name: true,
              region: true,
              branchCode: true,
              assigner: true,
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundException('회원 정보를 찾을 수 없습니다.');
      }

      const role = toAppRole(user.role);
      const adminRegion = toAdminRegion(user.adminRegion);

      return {
        user: {
          id: user.id,
          username: user.username,
          name: user.fullname,
          phone: user.phone,
          email: user.email,
          role,
          adminRegion,
          isSuperAdmin: isSuperAdminUser({ role, adminRegion }),
          canApproveGreeting: user.canApproveGreeting === true,
          churchId: user.churchId,
          church: user.church,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('auth/me failed:', error);
      throw new InternalServerErrorException(
        '회원 정보를 불러오지 못했습니다.',
      );
    }
  }

  private assertValidMobilePhone(phone: string) {
    const normalizedPhone = normalizePhone(phone);

    if (!/^01[016789]\d{7,8}$/.test(normalizedPhone)) {
      throw new BadRequestException(
        '연락처는 010-1234-5678 형식으로 입력해 주세요.',
      );
    }

    return normalizedPhone;
  }

  private assertValidEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('올바른 이메일 형식이 아닙니다.');
    }

    return normalizedEmail;
  }

  private smsOtpKey(phone: string) {
    return `sms:otp:${phone}`;
  }

  private smsVerifiedKey(phone: string) {
    return `sms:verified:${phone}`;
  }

  private smsCooldownKey(phone: string) {
    return `sms:cooldown:${phone}`;
  }

  private emailOtpKey(email: string) {
    return `email:otp:${email}`;
  }

  private emailVerifiedKey(email: string) {
    return `email:verified:${email}`;
  }

  private emailCooldownKey(email: string) {
    return `email:cooldown:${email}`;
  }

  private isProduction() {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private solapiErrorDetail(error: unknown): string {
    if (error instanceof MessageNotReceivedError) {
      const failed = error.failedMessageList?.[0] as
        | { statusMessage?: string; statusCode?: string }
        | undefined;
      return failed?.statusMessage ?? error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private async dispatchSms(phone: string, code: string) {
    const sender = normalizePhone(
      this.configService.get<string>('SOLAPI_SENDER') ?? '',
    );
    const text = `[소비조합] 인증번호는 [${code}]입니다. 3분 이내에 입력해 주세요.`;
    const solapi = this.getSolapiClient();

    if (!solapi || !sender) {
      console.warn(
        `[SMS dev mode] to=${phone} code=${code} (SOLAPI credentials or sender missing — restart backend after updating .env)`,
      );
      return;
    }

    try {
      await solapi.send({
        to: phone,
        from: sender,
        text,
        type: 'SMS',
      });
      console.log(`[SMS sent] to=${phone}`);
    } catch (error) {
      const reason = this.solapiErrorDetail(error);
      const isIpBlocked = /허용되지 않은 IP|Forbidden/i.test(reason);

      console.error('SMS send failed:', {
        phone,
        sender,
        reason,
        error,
      });

      // Local/dev: Solapi IP allowlists often block home/office IPs.
      // Fall back to console OTP so signup can still be tested.
      if (!this.isProduction() && isIpBlocked) {
        console.warn(
          `[SMS dev fallback] Solapi IP blocked — OTP logged to console. to=${phone} code=${code}\n` +
            `  Detail: ${reason}\n` +
            `  Fix (real SMS): Solapi 콘솔 → 보안 설정 → IP 허용 목록에 서버 IP를 추가하세요.`,
        );
        return;
      }

      if (reason.includes('발신번호')) {
        throw new InternalServerErrorException(
          '발신번호가 Solapi에 등록되지 않았습니다. SOLAPI_SENDER 값을 Solapi 콘솔에 등록된 번호로 설정해 주세요.',
        );
      }

      if (isIpBlocked) {
        throw new InternalServerErrorException(
          'SMS 발송이 차단되었습니다. Solapi 콘솔의 IP 허용 목록에 이 서버 IP를 추가해 주세요.',
        );
      }

      throw new InternalServerErrorException(
        `인증번호 발송에 실패했습니다. (${reason})`,
      );
    }
  }

  private getSolapiClient() {
    const apiKey = this.configService.get<string>('SOLAPI_API_KEY')?.trim();
    const apiSecret = this.configService.get<string>('SOLAPI_API_SECRET')?.trim();

    if (!apiKey || !apiSecret) {
      return null;
    }

    return new SolapiMessageService(apiKey, apiSecret);
  }

  private async dispatchEmail(email: string, code: string) {
    const smtpUser = this.configService.get<string>('SMTP_USER')?.trim() ?? '';
    const smtpConfigured = this.isSmtpConfigured();
    const transport = this.createMailTransport();
    const from = this.resolveSmtpFrom(smtpUser);
    const subject = '[소비조합] 이메일 인증번호';
    const text = `[소비조합] 이메일 인증번호는 [${code}]입니다. 10분 이내에 입력해 주세요.`;
    const html = `
      <p>소비조합 회원가입 이메일 인증번호입니다.</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
      <p>인증번호는 10분 동안 유효합니다.</p>
    `;

    if (!smtpConfigured) {
      console.warn(
        `[Email dev mode] to=${email} code=${code} (set SMTP_HOST, SMTP_USER, SMTP_PASS in .env)`,
      );
      return;
    }

    if (!transport || !from) {
      throw new InternalServerErrorException(
        'SMTP 설정을 읽지 못했습니다. .env 수정 후 백엔드를 재시작해 주세요.',
      );
    }

    try {
      await transport.sendMail({
        from,
        to: email,
        subject,
        text,
        html,
      });
      console.log(`[Email sent] to=${email}`);
    } catch (error) {
      console.error('Email send failed:', error);

      const smtpError = error as { code?: string; response?: string };
      if (smtpError.code === 'EAUTH') {
        throw new InternalServerErrorException(
          'SMTP 로그인에 실패했습니다. Gmail은 일반 비밀번호 대신 앱 비밀번호(App Password)를 사용해야 합니다.',
        );
      }

      if (smtpError.code === 'ESOCKET') {
        throw new InternalServerErrorException(
          'SMTP 연결에 실패했습니다. 포트 587은 SMTP_SECURE=false, 포트 465는 SMTP_SECURE=true로 설정해 주세요.',
        );
      }

      throw new InternalServerErrorException(
        '이메일 인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  private isSmtpConfigured() {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();
    return Boolean(host && user && pass);
  }

  private resolveSmtpFrom(user: string) {
    if (!user) {
      return '';
    }

    const displayName =
      this.configService.get<string>('SMTP_FROM_NAME')?.trim() ?? '소비조합';
    return `"${displayName}" <${user}>`;
  }

  private createMailTransport(): Transporter | null {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();

    if (!host || !user || !pass) {
      return null;
    }

    const port = Number(this.configService.get('SMTP_PORT') ?? 587);
    const secureSetting = this.configService.get<string>('SMTP_SECURE');
    // Port 587 uses STARTTLS (secure: false). Port 465 uses implicit SSL (secure: true).
    const secure = port === 465 || (port !== 587 && secureSetting === 'true');

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }
}
