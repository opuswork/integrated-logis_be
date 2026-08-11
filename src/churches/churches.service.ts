import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateChurchDto } from './dto/create-church.dto';

const churchSelect = {
  id: true,
  name: true,
  region: true,
  branchCode: true,
  assigner: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ChurchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateChurchDto) {
    const name = dto.name.trim();
    const region = dto.region.trim();
    const assigner = dto.assigner.trim();
    const branchCode = dto.branchCode?.trim() || null;

    const existing = await this.prisma.church.findUnique({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('이미 등록된 교회명입니다.');
    }

    const church = await this.prisma.church.create({
      data: { name, region, branchCode, assigner },
      select: churchSelect,
    });

    return {
      message: '교회 정보가 등록되었습니다.',
      church,
    };
  }

  async bulkCreate(churches: CreateChurchDto[], skipExisting = true) {
    const created: Array<{
      id: number;
      name: string;
      region: string;
      branchCode: string | null;
      assigner: string;
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    const skipped: string[] = [];
    const failed: Array<{ name: string; reason: string }> = [];

    for (const dto of churches) {
      const name = dto.name.trim();
      try {
        const existing = await this.prisma.church.findUnique({
          where: { name },
          select: churchSelect,
        });

        if (existing) {
          if (skipExisting) {
            skipped.push(name);
            continue;
          }
          failed.push({ name, reason: '이미 등록된 교회명입니다.' });
          continue;
        }

        const church = await this.prisma.church.create({
          data: {
            name,
            region: dto.region.trim(),
            branchCode: dto.branchCode?.trim() || null,
            assigner: dto.assigner.trim(),
          },
          select: churchSelect,
        });
        created.push(church);
      } catch (error) {
        failed.push({
          name,
          reason: error instanceof Error ? error.message : '등록 실패',
        });
      }
    }

    return {
      message: '교회 일괄 등록이 완료되었습니다.',
      summary: {
        requested: churches.length,
        created: created.length,
        skipped: skipped.length,
        failed: failed.length,
      },
      created,
      skipped,
      failed,
    };
  }

  findAll() {
    return this.prisma.church.findMany({
      select: churchSelect,
      orderBy: [{ region: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: number) {
    const church = await this.prisma.church.findUnique({
      where: { id },
      select: churchSelect,
    });

    if (!church) {
      throw new NotFoundException('교회 정보를 찾을 수 없습니다.');
    }

    return { church };
  }
}
