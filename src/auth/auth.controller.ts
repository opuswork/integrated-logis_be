import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifySmsDto } from './dto/verify-sms.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthUserPayload } from './jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '로그인 (JWT 발급)' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('sms/send')
  @ApiOperation({ summary: '휴대폰 인증번호 발송' })
  sendSms(@Body() dto: SendSmsDto) {
    return this.authService.sendSmsCode(dto.phone);
  }

  @Post('sms/verify')
  @ApiOperation({ summary: '휴대폰 인증번호 확인' })
  verifySms(@Body() dto: VerifySmsDto) {
    return this.authService.verifySmsCode(dto.phone, dto.code);
  }

  @Post('email/send')
  @ApiOperation({ summary: '이메일 인증번호 발송' })
  sendEmail(@Body() dto: SendEmailDto) {
    return this.authService.sendEmailCode(dto.email);
  }

  @Post('email/verify')
  @ApiOperation({ summary: '이메일 인증번호 확인' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmailCode(dto.email, dto.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 정보 조회 (JWT 필요)' })
  me(@CurrentUser() user: AuthUserPayload) {
    return this.authService.me(user);
  }
}
