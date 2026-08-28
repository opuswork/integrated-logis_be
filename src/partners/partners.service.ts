import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: number, q?: string) {
    const query = q?.trim();
    return this.prisma.partner.findMany({
      where: {
        userId,
        ...(query
          ? { name: { contains: query, mode: 'insensitive' } }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'desc' }],
    });
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

  async update(userId: number, id: number, dto: UpdatePartnerDto) {
    await this.assertOwned(userId, id);

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

  async remove(userId: number, id: number) {
    await this.assertOwned(userId, id);
    await this.prisma.partner.delete({ where: { id } });
    return { message: '거래처가 삭제되었습니다.' };
  }

  private async assertOwned(userId: number, id: number) {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!partner) {
      throw new NotFoundException('거래처를 찾을 수 없습니다.');
    }
    if (partner.userId !== userId) {
      throw new ForbiddenException('본인 거래처만 수정·삭제할 수 있습니다.');
    }
    return partner;
  }
}
