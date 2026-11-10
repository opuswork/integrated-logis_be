import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { AuthUserPayload } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthUserPayload, q?: string) {
    const query = q?.trim();
    const listAll = user.role === 'admin' || Boolean(query);
    return this.prisma.partner.findMany({
      where: {
        ...(listAll ? {} : { userId: user.id }),
        ...(query
          ? { name: { contains: query, mode: 'insensitive' as const } }
          : {}),
      },
      take: query ? 30 : undefined,
      // source desc: 'MANUAL'(직접 등록)이 'EXCEL_…'(엑셀 입력)보다 먼저 온다
      orderBy: [{ source: 'desc' }, { name: 'asc' }, { id: 'desc' }],
    });
  }

  /** 관리자 거래처관리 화면용 페이지 목록 (엑셀 입력분 포함 전체) */
  async findPage(opts: {
    page: number;
    pageSize: number;
    search?: string;
    source?: string;
  }) {
    const page = Math.max(1, Math.floor(opts.page) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, Math.floor(opts.pageSize) || 50),
    );
    const search = opts.search?.trim();
    const source = opts.source?.trim();
    const contains = (value: string) => ({
      contains: value,
      mode: 'insensitive' as const,
    });

    const where = {
      ...(source ? { source } : {}),
      ...(search
        ? {
            OR: [
              { name: contains(search) },
              { contactName: contains(search) },
              { address: contains(search) },
              { centerName: contains(search) },
            ],
          }
        : {}),
    };

    // 읽기 전용이라 트랜잭션 없이 두 쿼리를 함께 실행한다
    // (배포 환경에서 배치 $transaction 이 500 을 내던 문제)
    try {
      const [items, total] = await Promise.all([
        this.prisma.partner.findMany({
          where,
          // 목록·수정에 쓰는 칸만 (응답 크기 축소)
          select: {
            id: true,
            name: true,
            contactName: true,
            phone: true,
            address: true,
            email: true,
            source: true,
            category: true,
            subCategory: true,
            centerName: true,
          },
          orderBy: [{ source: 'desc' }, { name: 'asc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.partner.count({ where }),
      ]);
      return { items, total, page, pageSize };
    } catch (err) {
      this.logger.error(
        `거래처 페이지 조회 실패 page=${page} pageSize=${pageSize} search=${search ?? ''}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async create(userId: number, dto: CreatePartnerDto) {
    const name = dto.name.trim();
    const contactName = dto.contactName.trim();
    const phone = dto.phone.trim();
    const address = dto.address.trim();
    const email = dto.email?.trim() || null;

    if (!name || !contactName || !phone || !address) {
      throw new BadRequestException('필수 항목을 모두 입력해 주세요.');
    }

    return this.prisma.partner.create({
      data: {
        name,
        contactName,
        phone,
        address,
        email,
        userId,
      },
    });
  }

  async update(user: AuthUserPayload, id: number, dto: UpdatePartnerDto) {
    await this.assertCanMutate(user, id);

    const data: {
      name?: string;
      contactName?: string;
      phone?: string;
      address?: string;
      email?: string | null;
    } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('거래처명을 입력해 주세요.');
      data.name = name;
    }
    if (dto.contactName !== undefined) {
      const contactName = dto.contactName.trim();
      if (!contactName) {
        throw new BadRequestException('담당자명을 입력해 주세요.');
      }
      data.contactName = contactName;
    }
    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      if (!phone) throw new BadRequestException('연락처를 입력해 주세요.');
      data.phone = phone;
    }
    if (dto.address !== undefined) {
      const address = dto.address.trim();
      if (!address) throw new BadRequestException('주소를 입력해 주세요.');
      data.address = address;
    }
    if (dto.email !== undefined) {
      data.email = dto.email?.trim() || null;
    }

    return this.prisma.partner.update({
      where: { id },
      data,
    });
  }

  async remove(user: AuthUserPayload, id: number) {
    await this.assertCanMutate(user, id);
    await this.prisma.partner.delete({ where: { id } });
    return { message: '거래처가 삭제되었습니다.' };
  }

  private async assertCanMutate(user: AuthUserPayload, id: number) {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!partner) {
      throw new NotFoundException('거래처를 찾을 수 없습니다.');
    }
    if (user.role !== 'admin' && partner.userId !== user.id) {
      throw new ForbiddenException('본인 거래처만 수정·삭제할 수 있습니다.');
    }
    return partner;
  }
}
