import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { AuthUserPayload } from '../auth/jwt.strategy';
import { extractSheetImages } from '../common/excel-sheet-images';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mimeForExtension } from '../stock-inventory/stock-import-images';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { parsePartnerSheet } from './partner-bulk-import';
import { PartnerEvidenceStorageService } from './partner-evidence-storage.service';
import {
  buildRegionNames,
  classifyOwner,
  isMobileNumber,
  normalizePhone,
} from './partner-owner';

/** 관리자 일괄 등록으로 새로 넣은 거래처 */
const BULK_SOURCE = 'EXCEL_BULK';
const EVIDENCE_MIME = /^image\/(jpeg|png|webp|gif|heic|heif)$/i;

@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceStorage: PartnerEvidenceStorageService,
  ) {}

  async findAll(user: AuthUserPayload, q?: string) {
    const query = q?.trim();
    // source desc: 'MANUAL'(직접 등록)이 'EXCEL_…'(엑셀 입력)보다 먼저 온다
    const orderBy = [
      { source: 'desc' as const },
      { name: 'asc' as const },
      { id: 'desc' as const },
    ];

    if (!query) {
      return this.prisma.partner.findMany({
        where: user.role === 'admin' ? {} : { userId: user.id },
        orderBy,
      });
    }

    // 새 주문 고객사 검색: 로그인한 사람의 고객사만
    return this.prisma.partner.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' },
        ...(await this.searchScope(user)),
      },
      take: 30,
      orderBy,
    });
  }

  /**
   * 고객사 검색 범위.
   * - 관리자: 본사(중서남부=본사) 빼고 전부
   * - 본사 전용 계정: 본사 고객사만
   * - 사람 담당자(이름이 ownerName 에 있음): 자기 이름의 고객사만
   * - 그 밖의 회원: 자기 교회(지역)의 고객사
   * 회원은 자기가 직접 등록한 거래처도 함께 본다.
   */
  private async searchScope(
    user: AuthUserPayload,
  ): Promise<Prisma.PartnerWhereInput> {
    if (user.role === 'admin') return { hideInSearch: false };

    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        fullname: true,
        hqPartnerAccess: true,
        church: { select: { name: true } },
      },
    });
    if (!me) return { id: -1 };
    if (me.hqPartnerAccess) return { regionGroup: '본사' };

    const ownRegistered: Prisma.PartnerWhereInput = { userId: user.id };
    const name = me.fullname.trim();
    const isOwner =
      Boolean(name) &&
      (await this.prisma.partner.count({
        where: { ownerName: name },
        take: 1,
      })) > 0;
    if (isOwner) {
      return {
        OR: [{ ownerName: name, hideInSearch: false }, ownRegistered],
      };
    }

    const region = me.church?.name?.trim();
    return {
      OR: [
        ...(region ? [{ ownerRegion: region, hideInSearch: false }] : []),
        ownRegistered,
      ],
    };
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
              { customerType: contains(search) },
              { regionGroup: contains(search) },
              { mobile: contains(search) },
              { phone: contains(search) },
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
            mobile: true,
            address: true,
            addressDetail: true,
            email: true,
            evidenceImageUrl: true,
            evidenceImageName: true,
            source: true,
            category: true,
            subCategory: true,
            customerType: true,
            centerName: true,
            regionGroup: true,
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

  /** 등록·수정 폼의 구분·구분2·중앙 추천값 */
  async options() {
    const [categories, subCategories, centers] = await Promise.all([
      this.prisma.partner.findMany({
        where: { category: { not: null } },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
        take: 500,
      }),
      this.prisma.partner.findMany({
        where: { subCategory: { not: null } },
        distinct: ['subCategory'],
        select: { subCategory: true },
        orderBy: { subCategory: 'asc' },
        take: 500,
      }),
      this.prisma.partner.findMany({
        where: { centerName: { not: null } },
        distinct: ['centerName'],
        select: { centerName: true },
        orderBy: { centerName: 'asc' },
        take: 500,
      }),
    ]);
    const clean = (values: Array<string | null>) =>
      values.map((v) => (v ?? '').trim()).filter(Boolean);
    return {
      categories: clean(categories.map((r) => r.category)),
      subCategories: clean(subCategories.map((r) => r.subCategory)),
      centers: clean(centers.map((r) => r.centerName)),
    };
  }

  /** 개인앱 검색 범위를 정하는 지역 이름 목록 (교회 이름 + 거래처 중앙 값) */
  private async regionNames(extra: Array<string | null | undefined> = []) {
    const [churches, centers] = await Promise.all([
      this.prisma.church.findMany({ select: { name: true } }),
      this.prisma.partner.findMany({
        where: { centerName: { not: null } },
        distinct: ['centerName'],
        select: { centerName: true },
      }),
    ]);
    return buildRegionNames([
      ...churches.map((c) => c.name),
      ...centers.map((c) => c.centerName),
      ...extra,
    ]);
  }

  /** 휴대폰·유선전화 정리·검사 */
  private contactNumbers(
    mobileRaw: string | null | undefined,
    phoneRaw: string | null | undefined,
  ) {
    const mobile = normalizePhone(mobileRaw);
    const phone = normalizePhone(phoneRaw);
    if (mobile && !isMobileNumber(mobile)) {
      throw new BadRequestException(
        '휴대폰은 010-0000-0000 형식으로 입력해 주세요.',
      );
    }
    if (phone && isMobileNumber(phone)) {
      throw new BadRequestException('휴대폰 번호는 휴대폰 칸에 입력해 주세요.');
    }
    if (!mobile && !phone) {
      throw new BadRequestException('휴대폰 또는 유선전화를 입력해 주세요.');
    }
    return { mobile, phone };
  }

  async create(user: AuthUserPayload, dto: CreatePartnerDto) {
    const name = dto.name.trim();
    const contactName = dto.contactName.trim();
    const address = dto.address.trim();
    if (!name || !contactName || !address) {
      throw new BadRequestException('필수 항목을 모두 입력해 주세요.');
    }
    const { mobile, phone } = this.contactNumbers(dto.mobile, dto.phone);
    const centerName = dto.centerName?.trim() || null;

    // 관리자가 등록한 거래처(ADMIN)는 담당자·중앙 규칙으로 개인앱 검색 범위를 정한다.
    // 회원이 등록한 거래처(MANUAL)는 등록한 회원만 본다.
    const source = user.role === 'admin' ? 'ADMIN' : 'MANUAL';
    const owner =
      source === 'ADMIN'
        ? classifyOwner(
            { contactName, centerName, source },
            await this.regionNames([centerName]),
          )
        : { ownerName: null, ownerRegion: null };

    return this.prisma.partner.create({
      data: {
        name,
        category: dto.category?.trim() || null,
        subCategory: dto.subCategory?.trim() || null,
        centerName,
        contactName,
        mobile,
        phone,
        address,
        addressDetail: dto.addressDetail?.trim() || null,
        email: dto.email?.trim() || null,
        userId: user.id,
        source,
        ...owner,
      },
    });
  }

  async update(user: AuthUserPayload, id: number, dto: UpdatePartnerDto) {
    const current = await this.assertCanMutate(user, id);

    const required = (value: string, message: string) => {
      const text = value.trim();
      if (!text) throw new BadRequestException(message);
      return text;
    };
    const optional = (value: string | null | undefined) =>
      value?.trim() || null;

    const data: Prisma.PartnerUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = required(dto.name, '거래처명을 입력해 주세요.');
    }
    const contactName =
      dto.contactName !== undefined
        ? required(dto.contactName, '담당자명을 입력해 주세요.')
        : current.contactName;
    if (dto.contactName !== undefined) data.contactName = contactName;
    if (dto.address !== undefined) {
      data.address = required(dto.address, '주소를 입력해 주세요.');
    }
    if (dto.addressDetail !== undefined) {
      data.addressDetail = optional(dto.addressDetail);
    }
    if (dto.email !== undefined) data.email = optional(dto.email);
    if (dto.category !== undefined) data.category = optional(dto.category);
    if (dto.subCategory !== undefined) {
      data.subCategory = optional(dto.subCategory);
    }
    const centerName =
      dto.centerName !== undefined
        ? optional(dto.centerName)
        : current.centerName;
    if (dto.centerName !== undefined) data.centerName = centerName;
    if (dto.mobile !== undefined || dto.phone !== undefined) {
      Object.assign(
        data,
        this.contactNumbers(
          dto.mobile !== undefined ? dto.mobile : current.mobile,
          dto.phone !== undefined ? dto.phone : current.phone,
        ),
      );
    }

    // 관리자가 담당자·중앙을 고치면 개인앱 검색 범위(소유자)도 다시 계산한다
    if (
      user.role === 'admin' &&
      current.source !== 'MANUAL' &&
      (dto.contactName !== undefined || dto.centerName !== undefined)
    ) {
      Object.assign(
        data,
        classifyOwner(
          {
            contactName,
            centerName,
            regionGroup: current.regionGroup,
            source: current.source,
          },
          await this.regionNames([centerName]),
        ),
      );
    }

    return this.prisma.partner.update({ where: { id }, data });
  }

  async remove(user: AuthUserPayload, id: number) {
    await this.assertCanMutate(user, id);
    await this.prisma.partner.delete({ where: { id } });
    return { message: '거래처가 삭제되었습니다.' };
  }

  /** 거래처 증거자료(명함·계약서) 이미지 올리기. 있던 이미지는 바뀐다 */
  async setEvidence(
    user: AuthUserPayload,
    id: number,
    file: Express.Multer.File | undefined,
  ) {
    await this.assertCanMutate(user, id);
    if (!file?.buffer?.length) {
      throw new BadRequestException('이미지 파일을 선택해 주세요.');
    }
    if (!EVIDENCE_MIME.test(file.mimetype ?? '')) {
      throw new BadRequestException(
        '이미지 파일(jpg, png, webp, gif, heic)만 올릴 수 있습니다.',
      );
    }
    const stored = await this.evidenceStorage.store(file);
    return this.prisma.partner.update({
      where: { id },
      data: {
        evidenceImageUrl: stored.imageUrl,
        evidenceImageName: stored.originalName,
      },
    });
  }

  async clearEvidence(user: AuthUserPayload, id: number) {
    await this.assertCanMutate(user, id);
    return this.prisma.partner.update({
      where: { id },
      data: { evidenceImageUrl: null, evidenceImageName: null },
    });
  }

  /**
   * 거래처 일괄 등록 (관리자).
   * 거래처명 + 주소(도로명 부분)가 같은 기존 거래처는 수정, 나머지는 새로 등록한다.
   * dryRun 이면 저장하지 않고 행별 판정만 돌려준다.
   */
  async bulkImport(file: Express.Multer.File | undefined, dryRun: boolean) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('엑셀 파일을 업로드해 주세요.');
    }
    const { rows, evidenceColumn } = await parsePartnerSheet(file.buffer);
    let images = new Map<number, { buffer: Buffer; extension: string }>();
    try {
      images = await extractSheetImages(file.buffer, {
        preferredColumn: evidenceColumn,
      });
    } catch (err) {
      // 그림을 못 읽어도 거래처 정보는 등록한다
      this.logger.warn(
        `거래처 일괄 등록: 그림을 읽지 못했습니다 ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const names = [...new Set(rows.map((r) => r.name).filter(Boolean))];
    const existing = names.length
      ? await this.prisma.partner.findMany({
          where: { name: { in: names } },
          select: {
            id: true,
            name: true,
            address: true,
            source: true,
            regionGroup: true,
            centerName: true,
          },
        })
      : [];
    type Existing = (typeof existing)[number];
    const keyOf = (name: string, address: string) =>
      `${name.trim()}\u0000${address.replace(/\s+/g, ' ').trim()}`;
    const byKey = new Map<string, Existing[]>();
    for (const p of existing) {
      const key = keyOf(p.name, p.address);
      byKey.set(key, [...(byKey.get(key) ?? []), p]);
    }

    const seen = new Map<string, number>();
    const results = rows.map((row) => {
      const errors = [...row.errors];
      const key = keyOf(row.name, row.address);
      const matches = byKey.get(key) ?? [];
      if (!row.mobile && !row.phone && matches.length !== 1) {
        errors.push('휴대폰 또는 유선전화를 입력해 주세요.');
      }
      if (!errors.length) {
        const firstRow = seen.get(key);
        if (firstRow !== undefined) {
          errors.push(`${firstRow}행과 거래처명·주소가 같습니다.`);
        } else {
          seen.set(key, row.rowNumber);
        }
        if (matches.length > 1) {
          errors.push(
            `거래처명·주소가 같은 거래처가 이미 ${matches.length}건 있어 어느 것을 수정할지 알 수 없습니다.`,
          );
        }
      }
      const status: 'create' | 'update' | 'error' = errors.length
        ? 'error'
        : matches.length === 1
          ? 'update'
          : 'create';
      return {
        ...row,
        errors,
        status,
        target: status === 'update' ? matches[0] : null,
        hasImage: images.has(row.rowNumber),
      };
    });

    const summary = {
      total: results.length,
      create: results.filter((r) => r.status === 'create').length,
      update: results.filter((r) => r.status === 'update').length,
      error: results.filter((r) => r.status === 'error').length,
      images: results.filter((r) => r.status !== 'error' && r.hasImage).length,
    };
    const publicRows = results.map(({ target, ...rest }) => ({
      ...rest,
      existingId: target?.id ?? null,
    }));
    if (dryRun) return { summary, rows: publicRows };

    const valid = results.filter((r) => r.status !== 'error');
    if (!valid.length) {
      throw new BadRequestException(
        '등록할 수 있는 행이 없습니다. 오류 사유를 확인해 주세요.',
      );
    }

    // 그림은 DB 저장 전에 먼저 올린다 (Blob 업로드는 트랜잭션으로 되돌릴 수 없다)
    const evidence = new Map<number, { url: string; name: string }>();
    for (const row of valid) {
      const image = images.get(row.rowNumber);
      if (!image) continue;
      const ext = image.extension.replace(/^\./, '').toLowerCase() || 'png';
      const stored = await this.evidenceStorage.store({
        buffer: image.buffer,
        originalname: `${row.name}_증거자료.${ext}`,
        mimetype: mimeForExtension(ext),
      });
      evidence.set(row.rowNumber, {
        url: stored.imageUrl,
        name: stored.originalName,
      });
    }

    const regions = await this.regionNames(valid.map((r) => r.centerName));
    await this.prisma.$transaction(
      async (tx) => {
        for (const row of valid) {
          const image = evidence.get(row.rowNumber);
          const common = {
            name: row.name,
            contactName: row.contactName,
            address: row.address,
            addressDetail: row.addressDetail,
            ...(image
              ? { evidenceImageUrl: image.url, evidenceImageName: image.name }
              : {}),
          };
          if (row.target) {
            // 엑셀에서 비워 둔 칸은 기존 값을 그대로 둔다
            const keep = (value: string | null) => value ?? undefined;
            const centerName = row.centerName ?? row.target.centerName;
            const owner =
              row.target.source === 'MANUAL'
                ? {}
                : classifyOwner(
                    {
                      contactName: row.contactName,
                      centerName,
                      regionGroup: row.target.regionGroup,
                      source: row.target.source,
                    },
                    regions,
                  );
            await tx.partner.update({
              where: { id: row.target.id },
              data: {
                ...common,
                category: keep(row.category),
                subCategory: keep(row.subCategory),
                centerName: keep(row.centerName),
                mobile: keep(row.mobile),
                phone: keep(row.phone),
                ...owner,
              },
            });
          } else {
            await tx.partner.create({
              data: {
                ...common,
                category: row.category,
                subCategory: row.subCategory,
                centerName: row.centerName,
                mobile: row.mobile,
                phone: row.phone,
                source: BULK_SOURCE,
                ...classifyOwner(
                  {
                    contactName: row.contactName,
                    centerName: row.centerName,
                    source: BULK_SOURCE,
                  },
                  regions,
                ),
              },
            });
          }
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    return { summary, rows: publicRows, saved: valid.length };
  }

  private async assertCanMutate(user: AuthUserPayload, id: number) {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        source: true,
        contactName: true,
        centerName: true,
        regionGroup: true,
        mobile: true,
        phone: true,
      },
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
