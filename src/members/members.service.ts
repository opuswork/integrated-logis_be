import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import type { AuthUserPayload } from '../auth/jwt.strategy';
import {
  formatPhone,
  hashPassword,
  normalizePhone,
  normalizeUsername,
} from '../common/member-auth';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { BulkImportMembersDto } from './dto/bulk-import.dto';
import { PutMemberDto, UpdateMemberDto } from './dto/update-member.dto';

const userPublicSelect = {
  id: true,
  username: true,
  fullname: true,
  phone: true,
  email: true,
  role: true,
  adminRegion: true,
  accountSource: true,
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
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  private validateSignup(dto: CreateMemberDto) {
    const errors: Record<string, string> = {};

    const fullname = dto.fullname?.trim() ?? '';
    const username = normalizeUsername(dto.username ?? '');
    const phone = normalizePhone(dto.phone ?? '');
    const email = dto.email?.trim() ?? '';
    const password = dto.password ?? '';

    if (!fullname) {
      errors.fullname = '이름을 입력해 주세요.';
    } else if (fullname.length < 2) {
      errors.fullname = '이름은 2자 이상 입력해 주세요.';
    }

    if (!username) {
      errors.username = '아이디를 입력해 주세요.';
    } else if (!/^[a-z0-9]{4,20}$/.test(username)) {
      errors.username = '아이디는 영문 소문자와 숫자 4~20자로 입력해 주세요.';
    }

    if (!phone) {
      errors.phone = '연락처를 입력해 주세요.';
    } else if (!/^01[016789]\d{8}$/.test(phone)) {
      errors.phone = '연락처는 010-1234-5678 형식으로 입력해 주세요.';
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = '올바른 이메일 형식이 아닙니다.';
    }

    if (!password) {
      errors.password = '비밀번호를 입력해 주세요.';
    } else if (password.length < 4) {
      errors.password = '비밀번호는 4자 이상 입력해 주세요.';
    }

    return {
      errors,
      values: {
        fullname,
        username,
        phone: formatPhone(phone),
        email: email || null,
        password,
      },
    };
  }

  private validatePhone(phoneRaw: string) {
    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      throw new BadRequestException({
        message: '입력값을 확인해 주세요.',
        errors: { phone: '연락처를 입력해 주세요.' },
      });
    }
    if (!/^01[016789]\d{8}$/.test(phone)) {
      throw new BadRequestException({
        message: '입력값을 확인해 주세요.',
        errors: { phone: '연락처는 010-1234-5678 형식으로 입력해 주세요.' },
      });
    }
    return formatPhone(phone);
  }

  private assertCanUpdate(targetUserId: number, actor: AuthUserPayload) {
    if (actor.role === 'admin' || actor.id === targetUserId) {
      return;
    }
    throw new ForbiddenException('본인 또는 관리자만 수정할 수 있습니다.');
  }

  private assertAdmin(actor: AuthUserPayload) {
    if (actor.role !== 'admin') {
      throw new ForbiddenException('관리자만 회원 목록을 조회할 수 있습니다.');
    }
  }

  async findAll(actor: AuthUserPayload) {
    this.assertAdmin(actor);

    try {
      const members = await this.prisma.user.findMany({
        select: userPublicSelect,
        orderBy: [{ role: 'asc' }, { id: 'asc' }],
      });

      return {
        total: members.length,
        members,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      console.error('members list failed:', error);
      throw new InternalServerErrorException(
        '회원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  /** 주문서 주문자 자동완성: 이름 부분일치 회원 (관리자 전용) */
  async searchByName(qRaw: string, actor: AuthUserPayload) {
    this.assertAdmin(actor);

    const q = qRaw.trim();
    if (!q) {
      return [];
    }

    try {
      const users = await this.prisma.user.findMany({
        where: {
          role: 'MEMBER',
          fullname: { contains: q, mode: 'insensitive' },
        },
        select: {
          id: true,
          fullname: true,
          phone: true,
          churchId: true,
          church: { select: { name: true } },
        },
        orderBy: { fullname: 'asc' },
        take: 10,
      });

      return users.map((user) => ({
        id: user.id,
        fullname: user.fullname,
        phone: user.phone,
        churchId: user.churchId,
        churchName: user.church?.name ?? '',
      }));
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      console.error('member search failed:', error);
      throw new InternalServerErrorException(
        '회원 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  async findByUsername(usernameRaw: string, actor: AuthUserPayload) {
    this.assertAdmin(actor);

    const username = normalizeUsername(usernameRaw ?? '');
    if (!username) {
      throw new BadRequestException('아이디를 입력해 주세요.');
    }

    try {
      const member = await this.prisma.user.findUnique({
        where: { username },
        select: userPublicSelect,
      });

      if (!member) {
        throw new NotFoundException('회원 정보를 찾을 수 없습니다.');
      }

      return { member };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      console.error('member by username failed:', error);
      throw new InternalServerErrorException(
        '회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  async create(dto: CreateMemberDto) {
    const { errors, values } = this.validateSignup(dto);

    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        message: '입력값을 확인해 주세요.',
        errors,
      });
    }

    try {
      const existing = await this.prisma.user.findUnique({
        where: { username: values.username },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException({
          message: '이미 사용 중인 아이디입니다.',
          errors: { username: '이미 사용 중인 아이디입니다.' },
        });
      }

      if (dto.churchId != null) {
        const church = await this.prisma.church.findUnique({
          where: { id: dto.churchId },
          select: { id: true },
        });
        if (!church) {
          throw new BadRequestException({
            message: '입력값을 확인해 주세요.',
            errors: { churchId: '교회 정보를 찾을 수 없습니다.' },
          });
        }
      }

      const user = await this.prisma.user.create({
        data: {
          fullname: values.fullname,
          username: values.username,
          phone: values.phone,
          email: values.email,
          password: await hashPassword(values.password),
          role: 'MEMBER',
          accountSource: 'SELF_SIGNUP',
          churchId: dto.churchId ?? null,
        },
        select: userPublicSelect,
      });

      return {
        message: '회원가입이 완료되었습니다.',
        user,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      console.error('signup failed:', error);
      throw new InternalServerErrorException(
        '회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  async checkUsername(usernameRaw: string) {
    const username = normalizeUsername(usernameRaw ?? '');

    if (!username) {
      throw new BadRequestException({
        available: false,
        message: '아이디를 입력해 주세요.',
      });
    }

    if (!/^[a-z0-9]{4,20}$/.test(username)) {
      throw new BadRequestException({
        available: false,
        message: '아이디는 영문 소문자와 숫자 4~20자로 입력해 주세요.',
      });
    }

    try {
      const existing = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });

      if (existing) {
        return {
          available: false,
          message: '이미 사용 중인 아이디입니다.',
        };
      }

      return {
        available: true,
        message: '사용 가능한 아이디입니다.',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('check-username failed:', error);
      throw new InternalServerErrorException({
        available: false,
        message:
          '아이디 중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  }

  async updatePartial(
    id: number,
    dto: UpdateMemberDto,
    actor: AuthUserPayload,
  ) {
    this.assertCanUpdate(id, actor);

    if (
      dto.fullname === undefined &&
      dto.phone === undefined &&
      dto.email === undefined &&
      dto.password === undefined &&
      dto.churchId === undefined &&
      dto.role === undefined &&
      dto.adminRegion === undefined
    ) {
      throw new BadRequestException('수정할 항목이 없습니다.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, adminRegion: true },
    });

    if (!existing) {
      throw new NotFoundException('회원 정보를 찾을 수 없습니다.');
    }

    const data: {
      fullname?: string;
      phone?: string;
      email?: string | null;
      password?: string;
      churchId?: number | null;
      role?: 'MEMBER' | 'ADMIN' | 'FACTORY';
      adminRegion?: 'JUNGBU' | 'NAMBU' | 'SEOBU' | null;
    } = {};

    if (dto.role !== undefined || dto.adminRegion !== undefined) {
      const nextRole = dto.role ?? existing.role;
      const nextRegion =
        nextRole === 'ADMIN'
          ? dto.adminRegion !== undefined
            ? dto.adminRegion
            : existing.adminRegion
          : null;

      const roleChanged =
        nextRole !== existing.role ||
        (nextRole === 'ADMIN' && nextRegion !== existing.adminRegion) ||
        (nextRole !== 'ADMIN' && existing.adminRegion != null);

      if (roleChanged && !actor.isSuperAdmin) {
        throw new ForbiddenException(
          'Super admin만 권한(지역 관리자)을 변경할 수 있습니다.',
        );
      }

      if (roleChanged) {
        if (nextRole === 'ADMIN') {
          if (
            nextRegion !== 'JUNGBU' &&
            nextRegion !== 'NAMBU' &&
            nextRegion !== 'SEOBU'
          ) {
            throw new BadRequestException(
              '관리자 지정 시 지역(중부/남부/서부)을 선택해 주세요.',
            );
          }
          data.role = 'ADMIN';
          data.adminRegion = nextRegion;
        } else {
          data.role = nextRole as 'MEMBER' | 'FACTORY';
          data.adminRegion = null;
        }
      }
    }

    if (dto.fullname !== undefined) {
      const fullname = dto.fullname.trim();
      if (fullname.length < 2) {
        throw new BadRequestException({
          message: '입력값을 확인해 주세요.',
          errors: { fullname: '이름은 2자 이상 입력해 주세요.' },
        });
      }
      data.fullname = fullname;
    }

    if (dto.phone !== undefined) {
      data.phone = this.validatePhone(dto.phone);
    }

    if (dto.email !== undefined) {
      const email = dto.email?.trim() || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException({
          message: '입력값을 확인해 주세요.',
          errors: { email: '올바른 이메일 형식이 아닙니다.' },
        });
      }
      data.email = email;
    }

    if (dto.password !== undefined) {
      if (dto.password.length < 4) {
        throw new BadRequestException({
          message: '입력값을 확인해 주세요.',
          errors: { password: '비밀번호는 4자 이상 입력해 주세요.' },
        });
      }
      data.password = await hashPassword(dto.password);
    }

    if (dto.churchId !== undefined) {
      if (dto.churchId === null) {
        data.churchId = null;
      } else {
        const church = await this.prisma.church.findUnique({
          where: { id: dto.churchId },
          select: { id: true },
        });
        if (!church) {
          throw new BadRequestException({
            message: '입력값을 확인해 주세요.',
            errors: { churchId: '교회 정보를 찾을 수 없습니다.' },
          });
        }
        data.churchId = dto.churchId;
      }
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
        select: userPublicSelect,
      });

      return {
        message: '회원 정보가 수정되었습니다.',
        user,
      };
    } catch (error) {
      console.error('member patch failed:', error);
      throw new InternalServerErrorException(
        '회원 정보 수정에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  async replace(id: number, dto: PutMemberDto, actor: AuthUserPayload) {
    this.assertCanUpdate(id, actor);

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('회원 정보를 찾을 수 없습니다.');
    }

    const fullname = dto.fullname.trim();
    if (fullname.length < 2) {
      throw new BadRequestException({
        message: '입력값을 확인해 주세요.',
        errors: { fullname: '이름은 2자 이상 입력해 주세요.' },
      });
    }

    const phone = this.validatePhone(dto.phone);
    const email = dto.email?.trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException({
        message: '입력값을 확인해 주세요.',
        errors: { email: '올바른 이메일 형식이 아닙니다.' },
      });
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          fullname,
          phone,
          email,
          password: await hashPassword(dto.password),
        },
        select: userPublicSelect,
      });

      return {
        message: '회원 정보가 교체되었습니다.',
        user,
      };
    } catch (error) {
      console.error('member put failed:', error);
      throw new InternalServerErrorException(
        '회원 정보 수정에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }

  inferChurchMeta(churchName: string, assignerHint?: string) {
    const name = churchName.trim();
    const digitsMatch = name.match(/^(.+?)(\d+)$/);

    if (digitsMatch) {
      return {
        name,
        region: digitsMatch[1],
        branchCode: digitsMatch[2],
        assigner: assignerHint ?? '공석',
      };
    }

    return {
      name,
      region: name,
      branchCode: null as string | null,
      assigner: assignerHint ?? '공석',
    };
  }

  async bulkImport(dto: BulkImportMembersDto) {
    const createMissingChurches = dto.createMissingChurches ?? true;
    const skipExisting = dto.skipExisting ?? true;

    const churchAssignerByName = new Map<string, string>();
    for (const row of dto.members) {
      if (row.fullname.includes('총무')) {
        churchAssignerByName.set(row.churchName.trim(), row.fullname.trim());
      }
    }

    const createdChurches: string[] = [];
    const churchIdByName = new Map<string, number>();

    const uniqueChurchNames = [
      ...new Set(dto.members.map((row) => row.churchName.trim()).filter(Boolean)),
    ];

    for (const churchName of uniqueChurchNames) {
      let church = await this.prisma.church.findUnique({
        where: { name: churchName },
        select: { id: true, name: true },
      });

      if (!church && createMissingChurches) {
        const meta = this.inferChurchMeta(
          churchName,
          churchAssignerByName.get(churchName),
        );
        church = await this.prisma.church.create({
          data: meta,
          select: { id: true, name: true },
        });
        createdChurches.push(churchName);
      }

      if (church) {
        churchIdByName.set(churchName, church.id);
      }
    }

    const created: Array<{ username: string; id: number }> = [];
    const skipped: string[] = [];
    const failed: Array<{ username: string; reason: string }> = [];

    for (const row of dto.members) {
      const churchName = row.churchName.trim();
      const churchId = churchIdByName.get(churchName);

      if (!churchId) {
        failed.push({
          username: row.username,
          reason: `교회를 찾을 수 없습니다: ${churchName}`,
        });
        continue;
      }

      const signupDto: CreateMemberDto = {
        fullname: row.fullname,
        username: row.username,
        phone: row.phone,
        password: row.password,
        email: row.email,
        churchId,
      };

      const { errors, values } = this.validateSignup(signupDto);
      if (Object.keys(errors).length > 0) {
        failed.push({
          username: row.username,
          reason: Object.values(errors).join(', '),
        });
        continue;
      }

      try {
        const existing = await this.prisma.user.findUnique({
          where: { username: values.username },
          select: { id: true },
        });

        if (existing) {
          if (skipExisting) {
            skipped.push(values.username);
            continue;
          }
          failed.push({
            username: values.username,
            reason: '이미 사용 중인 아이디입니다.',
          });
          continue;
        }

        const user = await this.prisma.user.create({
          data: {
            fullname: values.fullname,
            username: values.username,
            phone: values.phone,
            email: values.email,
            password: await hashPassword(values.password),
            role: 'MEMBER',
            accountSource: 'BULK_IMPORT',
            churchId,
          },
          select: { id: true, username: true },
        });

        created.push({ username: user.username, id: user.id });
      } catch (error) {
        failed.push({
          username: row.username,
          reason: error instanceof Error ? error.message : '등록 실패',
        });
      }
    }

    return {
      message: '회원 일괄 등록이 완료되었습니다.',
      summary: {
        requested: dto.members.length,
        churchesCreated: createdChurches.length,
        membersCreated: created.length,
        membersSkipped: skipped.length,
        membersFailed: failed.length,
      },
      createdChurches,
      createdMembers: created,
      skippedUsernames: skipped,
      failed,
    };
  }
}
