import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockLedgerType } from '../generated/prisma/client';
import * as XLSX from 'xlsx';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockInventoryDto,
  ReplaceStockInventoryDto,
  UpdateStockInventoryDto,
} from './dto/stock-inventory.dto';
import { ProductImageStorageService } from './product-image-storage.service';
import {
  extractStockRowImages,
  type ExtractedImage,
} from './stock-import-images';
import {
  mapExcelRow,
  normalizeHeader,
  pickCode,
  pickField,
  pickRowNumber,
  toDisplayString,
} from './stock-import-row';
import { LOW_STOCK_THRESHOLD, recordAdminStockChange } from './stock-ledger';
import { resolveStockChange } from './stock-quantity';

/** 한 번에 처리할 수 있는 최대 행 수 (업로드 타임아웃 방지) */
const MAX_IMPORT_ROWS = 1000;

/** 미리보기 / 일괄등록에서 기존 상품 기본값으로 쓰는 필드 */
const IMPORT_DEFAULT_SELECT = {
  id: true,
  code: true,
  productName: true,
  spec: true,
  unit: true,
  stock: true,
  stockMax: true,
  effectiveDate: true,
  priceOver500man: true,
  priceOver100man: true,
  wholesalePrice: true,
  associatePrice: true,
  category: true,
  imageUrl: true,
  imageHash: true,
} as const;

/** 사진 열을 찾을 때 쓰는 헤더 별칭 */
const PHOTO_HEADER_ALIASES = ['사진', '이미지', 'imageurl', 'image'];
/** 사진 열을 못 찾았을 때 기본값 (양식 기준 코드 다음 B열) */
const DEFAULT_PHOTO_COLUMN = 2;

/** 미리보기 응답이 비대해지지 않도록 썸네일을 인라인할 상한 */
const THUMBNAIL_MAX_ROWS = 30;
const THUMBNAIL_MAX_BYTES = 200 * 1024;

/**
 * 사진 처리 결과.
 * NONE=사진 칸 비어 기존 유지, NEW=새 사진, CHANGED=해시 다름, SAME=해시 같아 생략,
 * REMOVE='-' 입력으로 삭제, URL=주소 문자열 입력
 */
export type StockImageStatus =
  'NONE' | 'NEW' | 'CHANGED' | 'SAME' | 'REMOVE' | 'URL';

export type StockImportPreviewRow = {
  /** 엑셀 행 번호 (헤더가 1행이므로 첫 데이터 행은 2) */
  rowNumber: number;
  status: 'CREATE' | 'UPDATE' | 'INVALID';
  code: string;
  productName: string;
  spec: string | null;
  unit: number | null;
  category: string;
  stock: number | null;
  stockIn: number | null;
  currentStock: number | null;
  nextStock: number | null;
  effectiveDate: string | null;
  wholesalePrice: number | null;
  imageStatus: StockImageStatus;
  /** data URI. 응답 크기를 위해 앞쪽 행·작은 이미지만 채운다 */
  imageThumbnail: string | null;
  error?: string;
};

@Injectable()
export class StockInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageStorage: ProductImageStorageService,
  ) {}

  private async resolveImageFields(
    file: Express.Multer.File | undefined,
    imageUrl?: string | null,
  ) {
    if (file?.buffer?.length) {
      return this.imageStorage.store(file);
    }
    const trimmed = imageUrl?.trim();
    if (trimmed) {
      return {
        imageUrl: trimmed,
        imageStoredName: null as string | null,
        imageOriginalName: null as string | null,
      };
    }
    return {
      imageUrl: null as string | null,
      imageStoredName: null as string | null,
      imageOriginalName: null as string | null,
    };
  }

  async create(dto: CreateStockInventoryDto, file?: Express.Multer.File) {
    const code = dto.code.trim();
    const existing = await this.prisma.stockInventory.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`이미 등록된 코드입니다: ${code}`);
    }

    const image = await this.resolveImageFields(file, dto.imageUrl);
    const nextStock = resolveStockChange({
      previousStock: null,
      previousStockMax: null,
      stock: dto.stock ?? null,
      stockMax: dto.stockMax,
      stockIn: dto.stockIn,
    });

    const created = await this.prisma.stockInventory.create({
      data: {
        code,
        imageUrl: image.imageUrl,
        imageStoredName: image.imageStoredName,
        imageOriginalName: image.imageOriginalName,
        productName: dto.productName.trim(),
        spec: dto.spec?.trim() || null,
        unit: dto.unit,
        stock: nextStock.stock,
        stockMax: nextStock.stockMax,
        effectiveDate: new Date(dto.effectiveDate),
        priceOver500man: dto.priceOver500man,
        priceOver100man: dto.priceOver100man,
        wholesalePrice: dto.wholesalePrice,
        associatePrice: dto.associatePrice,
        category: dto.category.trim(),
        openStock: dto.openStock ?? true,
      },
    });

    await recordAdminStockChange(this.prisma, {
      productId: created.id,
      productName: created.productName,
      previousStock: null,
      nextStock: created.stock,
    });

    return created;
  }

  findAll(category?: string, keyword?: string, openOnly = false) {
    const normalizedKeyword = keyword?.trim();
    return this.prisma.stockInventory.findMany({
      where: {
        ...(openOnly ? { openStock: true } : undefined),
        ...(category?.trim() ? { category: category.trim() } : undefined),
        ...(normalizedKeyword
          ? {
              OR: [
                {
                  productName: {
                    contains: normalizedKeyword,
                    mode: 'insensitive',
                  },
                },
                {
                  code: {
                    contains: normalizedKeyword,
                    mode: 'insensitive',
                  },
                },
                {
                  spec: {
                    contains: normalizedKeyword,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : undefined),
      },
      orderBy: [{ category: 'asc' }, { productName: 'asc' }],
    });
  }

  async getStatus() {
    const [products, ledgers] = await Promise.all([
      this.prisma.stockInventory.findMany({
        orderBy: [{ productName: 'asc' }],
      }),
      this.prisma.stockInventoryLedger.findMany({
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const byProduct = new Map<
      number,
      { initial: number; added: number; deducted: number }
    >();

    for (const p of products) {
      byProduct.set(p.id, { initial: 0, added: 0, deducted: 0 });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthAdditionQty = 0;
    let monthAdditionEvents = 0;
    let orderDeductQty = 0;

    for (const entry of ledgers) {
      const agg = byProduct.get(entry.productId);
      if (agg) {
        if (entry.type === StockLedgerType.INITIAL) {
          agg.initial += entry.delta;
        } else if (entry.type === StockLedgerType.ADDITION) {
          agg.added += entry.delta;
        } else if (entry.type === StockLedgerType.ORDER_DEDUCT) {
          if (entry.delta < 0) {
            agg.deducted += -entry.delta;
          }
        }
      }

      if (
        entry.type === StockLedgerType.ADDITION &&
        entry.delta > 0 &&
        entry.createdAt >= monthStart
      ) {
        monthAdditionQty += entry.delta;
        monthAdditionEvents += 1;
      }

      if (entry.type === StockLedgerType.ORDER_DEDUCT && entry.delta < 0) {
        orderDeductQty += -entry.delta;
      }
    }

    const tracked = products.filter(
      (p) => p.stock !== null && p.stock !== undefined,
    );
    const totalCurrentStock = tracked.reduce(
      (sum, p) => sum + (p.stock ?? 0),
      0,
    );
    const lowStockCount = tracked.filter(
      (p) => (p.stock ?? 0) <= LOW_STOCK_THRESHOLD,
    ).length;

    const rows = tracked.map((p) => {
      const agg = byProduct.get(p.id) ?? {
        initial: 0,
        added: 0,
        deducted: 0,
      };
      const current = p.stock ?? 0;
      return {
        id: p.id,
        productName: p.productName,
        initial: agg.initial,
        added: agg.added,
        deducted: agg.deducted,
        current,
        threshold: LOW_STOCK_THRESHOLD,
        updatedAt: p.updatedAt,
        isLow: current <= LOW_STOCK_THRESHOLD,
      };
    });

    const history = ledgers.slice(0, 50).map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      type: entry.type,
      productName: entry.productName,
      delta: entry.delta,
      actorLabel: entry.actorLabel,
      orderId: entry.orderId,
    }));

    return {
      metrics: {
        totalCurrentStock,
        trackedCount: tracked.length,
        monthAdditionQty,
        monthAdditionEvents,
        orderDeductQty,
        lowStockCount,
      },
      rows,
      history,
    };
  }

  async findOne(id: number) {
    const item = await this.prisma.stockInventory.findUnique({
      where: { id },
    });
    if (!item) {
      throw new NotFoundException({
        message: '재고/상품 정보를 찾을 수 없습니다.',
      });
    }
    return item;
  }

  async replace(
    id: number,
    dto: ReplaceStockInventoryDto,
    file?: Express.Multer.File,
  ) {
    const current = await this.findOne(id);
    const image = file?.buffer?.length
      ? await this.imageStorage.store(file)
      : dto.imageUrl !== undefined
        ? await this.resolveImageFields(undefined, dto.imageUrl)
        : {
            imageUrl: current.imageUrl,
            imageStoredName: current.imageStoredName,
            imageOriginalName: current.imageOriginalName,
          };

    const nextStock = resolveStockChange({
      previousStock: current.stock,
      previousStockMax: current.stockMax,
      stock: dto.stock,
      stockMax: dto.stockMax,
      stockIn: dto.stockIn,
    });
    const updated = await this.prisma.stockInventory.update({
      where: { id },
      data: {
        code: dto.code.trim(),
        imageUrl: image.imageUrl,
        imageStoredName: image.imageStoredName,
        imageOriginalName: image.imageOriginalName,
        productName: dto.productName.trim(),
        spec: dto.spec?.trim() || null,
        unit: dto.unit,
        stock: nextStock.stock,
        stockMax: nextStock.stockMax,
        effectiveDate: new Date(dto.effectiveDate),
        priceOver500man: dto.priceOver500man,
        priceOver100man: dto.priceOver100man,
        wholesalePrice: dto.wholesalePrice,
        associatePrice: dto.associatePrice,
        category: dto.category.trim(),
        openStock: dto.openStock ?? true,
      },
    });

    await recordAdminStockChange(this.prisma, {
      productId: updated.id,
      productName: updated.productName,
      previousStock: current.stock,
      nextStock: updated.stock,
    });

    return updated;
  }

  async update(
    id: number,
    dto: UpdateStockInventoryDto,
    file?: Express.Multer.File,
  ) {
    const current = await this.findOne(id);
    const imagePatch = file?.buffer?.length
      ? await this.imageStorage.store(file)
      : dto.imageUrl !== undefined
        ? await this.resolveImageFields(undefined, dto.imageUrl)
        : null;

    if (dto.code !== undefined) {
      const nextCode = dto.code.trim();
      if (nextCode !== current.code) {
        const conflict = await this.prisma.stockInventory.findUnique({
          where: { code: nextCode },
          select: { id: true },
        });
        if (conflict) {
          throw new ConflictException(`이미 등록된 코드입니다: ${nextCode}`);
        }
      }
    }

    const touchesStock =
      dto.stock !== undefined ||
      dto.stockMax !== undefined ||
      dto.stockIn !== undefined;
    const nextStock = touchesStock
      ? resolveStockChange({
          previousStock: current.stock,
          previousStockMax: current.stockMax,
          stock: dto.stock,
          stockMax: dto.stockMax,
          stockIn: dto.stockIn,
        })
      : null;

    const updated = await this.prisma.stockInventory.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(imagePatch
          ? {
              imageUrl: imagePatch.imageUrl,
              imageStoredName: imagePatch.imageStoredName,
              imageOriginalName: imagePatch.imageOriginalName,
            }
          : {}),
        ...(dto.productName !== undefined
          ? { productName: dto.productName.trim() }
          : {}),
        ...(dto.spec !== undefined ? { spec: dto.spec?.trim() || null } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(nextStock
          ? { stock: nextStock.stock, stockMax: nextStock.stockMax }
          : {}),
        ...(dto.effectiveDate !== undefined
          ? { effectiveDate: new Date(dto.effectiveDate) }
          : {}),
        ...(dto.priceOver500man !== undefined
          ? { priceOver500man: dto.priceOver500man }
          : {}),
        ...(dto.priceOver100man !== undefined
          ? { priceOver100man: dto.priceOver100man }
          : {}),
        ...(dto.wholesalePrice !== undefined
          ? { wholesalePrice: dto.wholesalePrice }
          : {}),
        ...(dto.associatePrice !== undefined
          ? { associatePrice: dto.associatePrice }
          : {}),
        ...(dto.category !== undefined
          ? { category: dto.category.trim() }
          : {}),
        ...(dto.openStock !== undefined ? { openStock: dto.openStock } : {}),
      },
    });

    if (touchesStock) {
      await recordAdminStockChange(this.prisma, {
        productId: updated.id,
        productName: updated.productName,
        previousStock: current.stock,
        nextStock: updated.stock,
      });
    }

    return updated;
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.stockInventory.delete({ where: { id } });
  }

  /** 업로드된 Excel/CSV 첫 시트를 행 객체 배열로 읽는다. */
  private readSheetRows(file: Express.Multer.File | undefined): {
    rows: Record<string, unknown>[];
    photoColumn: number;
  } {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        message: 'Excel/CSV 파일을 업로드해 주세요.',
      });
    }

    const workbook = XLSX.read(file.buffer, {
      type: 'buffer',
      cellDates: true,
    });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException({
        message: '시트 데이터를 찾을 수 없습니다.',
      });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });

    if (rows.length === 0) {
      throw new BadRequestException({
        message: '가져올 상품 행이 없습니다.',
      });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException({
        message: `한 번에 올릴 수 있는 행은 최대 ${MAX_IMPORT_ROWS}행입니다. (현재 ${rows.length}행)`,
      });
    }

    return {
      rows,
      photoColumn: this.findPhotoColumn(sheet),
    };
  }

  /**
   * 헤더 행에서 '사진' 열이 몇 번째인지 찾는다 (1-based).
   * 셀에 넣은 사진을 다른 열의 장식 이미지와 구분하려면 이 값이 필요하다.
   */
  private findPhotoColumn(sheet: XLSX.WorkSheet): number {
    const header = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      range: 0,
      defval: '',
      raw: true,
    })[0];

    if (Array.isArray(header)) {
      const index = header.findIndex((cell) => {
        const name = normalizeHeader(toDisplayString(cell));
        return name !== '' && PHOTO_HEADER_ALIASES.some((a) => name === a);
      });
      if (index >= 0) return index + 1;
    }
    return DEFAULT_PHOTO_COLUMN;
  }

  /**
   * 이 행의 사진을 어떻게 처리할지 정한다.
   * 미리보기와 실제 저장이 같은 판단을 쓰도록 한 곳에 모아 둔다.
   */
  private resolveImageStatus(
    image: ExtractedImage | null,
    imageCell: string | null | undefined,
    existing: { imageHash?: string | null } | null,
  ): StockImageStatus {
    if (image) {
      if (!existing) return 'NEW';
      if (existing.imageHash && existing.imageHash === image.sha256) {
        return 'SAME';
      }
      return existing.imageHash ? 'CHANGED' : 'NEW';
    }
    if (imageCell === null) return 'REMOVE';
    if (typeof imageCell === 'string' && imageCell !== '') return 'URL';
    return 'NONE';
  }

  /**
   * 저장 시 이미지 필드를 어떻게 쓸지 정한다.
   *
   * 핵심: **사진 칸이 비어 있으면 이미지 필드를 아예 건드리지 않는다.**
   * 재고만 올리는 엑셀 때문에 기존 상품 사진이 지워지면 안 된다.
   */
  private async resolveImportImage(
    image: ExtractedImage | null,
    imageCell: string | null | undefined,
    existing: { imageHash?: string | null } | null,
  ): Promise<{
    data: {
      imageUrl?: string | null;
      imageStoredName?: string | null;
      imageOriginalName?: string | null;
      imageHash?: string | null;
    };
    uploaded: boolean;
  }> {
    // 셀에 넣은 사진이 있다 → 바뀐 경우에만 업로드한다
    if (image) {
      if (existing?.imageHash && existing.imageHash === image.sha256) {
        return { data: {}, uploaded: false }; // 같은 사진이라 건너뛴다
      }
      const stored = await this.imageStorage.storeBuffer(
        image.buffer,
        image.originalName,
        image.mimetype,
      );
      return {
        data: {
          imageUrl: stored.imageUrl,
          imageStoredName: stored.imageStoredName,
          imageOriginalName: stored.imageOriginalName,
          imageHash: image.sha256,
        },
        uploaded: true,
      };
    }

    // '-' / '삭제' → 사진 제거
    if (imageCell === null) {
      return {
        data: {
          imageUrl: null,
          imageStoredName: null,
          imageOriginalName: null,
          imageHash: null,
        },
        uploaded: false,
      };
    }

    // URL 문자열 입력 (기존 방식)
    if (typeof imageCell === 'string' && imageCell !== '') {
      return {
        data: {
          imageUrl: imageCell,
          imageStoredName: null,
          imageOriginalName: null,
          imageHash: null,
        },
        uploaded: false,
      };
    }

    // 빈 칸 → 기존 사진 유지
    return { data: {}, uploaded: false };
  }

  /**
   * 저장하지 않고 업로드 파일을 파싱해 행별 결과만 돌려준다 (미리보기).
   * 실제 저장과 같은 `mapExcelRow` / `resolveStockChange` 를 쓰기 때문에
   * 미리보기 숫자와 저장 결과가 어긋나지 않는다.
   */
  async previewImportFromFile(file: Express.Multer.File | undefined) {
    const { rows, photoColumn } = this.readSheetRows(file);
    const summary = {
      total: rows.length,
      create: 0,
      update: 0,
      invalid: 0,
      imageChanged: 0,
    };
    const preview: StockImportPreviewRow[] = [];

    // 미리보기는 쓰기가 없으므로 기존 상품을 한 번에 조회해 둔다 (행마다 쿼리 X).
    const codes = [
      ...new Set(rows.map((row) => pickCode(row)).filter(Boolean)),
    ];
    const existingByCode = new Map(
      (
        await this.prisma.stockInventory.findMany({
          where: { code: { in: codes } },
          select: IMPORT_DEFAULT_SELECT,
        })
      ).map((product) => [product.code, product]),
    );

    const imagesByRow = await extractStockRowImages(file!.buffer, photoColumn);
    let thumbnailsUsed = 0;

    for (const [index, row] of rows.entries()) {
      const rowNumber = pickRowNumber(row, index + 2);
      const code = pickCode(row);
      const existing = existingByCode.get(code) ?? null;
      const image = imagesByRow.get(rowNumber) ?? null;

      try {
        const parsed = mapExcelRow(row, existing);
        const next = resolveStockChange({
          previousStock: existing?.stock ?? null,
          previousStockMax: existing?.stockMax ?? null,
          stock: parsed.stock ?? undefined,
          stockMax: parsed.stockMax ?? undefined,
          stockIn: parsed.stockIn ?? undefined,
        });

        const imageStatus = this.resolveImageStatus(
          image,
          parsed.imageUrl,
          existing,
        );
        if (imageStatus === 'NEW' || imageStatus === 'CHANGED') {
          summary.imageChanged += 1;
        }

        let imageThumbnail: string | null = null;
        if (
          image &&
          thumbnailsUsed < THUMBNAIL_MAX_ROWS &&
          image.buffer.length <= THUMBNAIL_MAX_BYTES
        ) {
          imageThumbnail = `data:${image.mimetype};base64,${image.buffer.toString('base64')}`;
          thumbnailsUsed += 1;
        }

        summary[existing ? 'update' : 'create'] += 1;
        preview.push({
          rowNumber,
          status: existing ? 'UPDATE' : 'CREATE',
          code: parsed.code,
          productName: parsed.productName,
          spec: parsed.spec ?? null,
          unit: parsed.unit,
          category: parsed.category,
          stock: parsed.stock ?? null,
          stockIn: parsed.stockIn ?? null,
          currentStock: existing?.stock ?? null,
          nextStock: next.stock,
          effectiveDate: parsed.effectiveDate.toISOString(),
          wholesalePrice: parsed.wholesalePrice,
          imageStatus,
          imageThumbnail,
        });
      } catch (error) {
        summary.invalid += 1;
        preview.push({
          rowNumber,
          status: 'INVALID',
          code,
          productName: toDisplayString(
            pickField(row, ['품명', 'productName', '상품명']),
          ),
          spec: null,
          unit: null,
          category: toDisplayString(pickField(row, ['구분', 'category'])),
          stock: null,
          stockIn: null,
          currentStock: existing?.stock ?? null,
          nextStock: null,
          effectiveDate: null,
          wholesalePrice: null,
          imageStatus: 'NONE',
          imageThumbnail: null,
          error:
            error instanceof Error
              ? error.message
              : '알 수 없는 오류로 행을 읽지 못했습니다.',
        });
      }
    }

    return { summary, rows: preview };
  }

  async bulkImportFromFile(
    file: Express.Multer.File | undefined,
    skipExisting = true,
  ) {
    const { rows, photoColumn } = this.readSheetRows(file);

    const summary = {
      requested: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      imageUpdated: 0,
    };
    const createdCodes: string[] = [];
    const updatedCodes: string[] = [];
    const skippedCodes: string[] = [];
    const failed: Array<{ row?: number; code?: string; reason: string }> = [];

    const imagesByRow = await extractStockRowImages(file!.buffer, photoColumn);

    for (const [index, row] of rows.entries()) {
      const rowNumber = pickRowNumber(row, index + 2);
      const code = pickCode(row);
      const rowImage = imagesByRow.get(rowNumber) ?? null;
      try {
        // 기존 상품을 먼저 찾아 비어 있는 칸의 기본값으로 쓴다
        // (재고만 올릴 때 단위/적용일자/가격을 다시 채우지 않아도 되게 한다).
        const before = code
          ? await this.prisma.stockInventory.findUnique({
              where: { code },
              select: IMPORT_DEFAULT_SELECT,
            })
          : null;

        if (before && skipExisting) {
          summary.skipped += 1;
          skippedCodes.push(code);
          continue;
        }

        const parsed = mapExcelRow(row, before);

        if (before) {
          // 엑셀에 재고 칸이 비어 있으면 기존 재고를 건드리지 않는다
          // (가격표만 다시 올릴 때 창고 수량이 날아가는 것을 막는다).
          const nextStock = resolveStockChange({
            previousStock: before.stock,
            previousStockMax: before.stockMax,
            stock: parsed.stock ?? undefined,
            stockMax: parsed.stockMax ?? undefined,
            stockIn: parsed.stockIn ?? undefined,
          });
          const imagePatch = await this.resolveImportImage(
            rowImage,
            parsed.imageUrl,
            before,
          );
          if (imagePatch.uploaded) {
            summary.imageUpdated += 1;
          }

          const updated = await this.prisma.stockInventory.update({
            where: { code: parsed.code },
            data: {
              ...imagePatch.data,
              productName: parsed.productName,
              spec: parsed.spec,
              unit: parsed.unit,
              stock: nextStock.stock,
              stockMax: nextStock.stockMax,
              effectiveDate: parsed.effectiveDate,
              priceOver500man: parsed.priceOver500man,
              priceOver100man: parsed.priceOver100man,
              wholesalePrice: parsed.wholesalePrice,
              associatePrice: parsed.associatePrice,
              category: parsed.category,
            },
          });
          await recordAdminStockChange(this.prisma, {
            productId: updated.id,
            productName: updated.productName,
            previousStock: before.stock,
            nextStock: updated.stock,
          });
          summary.updated += 1;
          updatedCodes.push(parsed.code);
          continue;
        }

        // 신규 등록: 재고 칸이 비어 있으면 입고수량을 초기 재고로 본다.
        const initialStock = parsed.stock ?? parsed.stockIn ?? null;
        const newImage = await this.resolveImportImage(
          rowImage,
          parsed.imageUrl,
          null,
        );
        if (newImage.uploaded) {
          summary.imageUpdated += 1;
        }

        const created = await this.prisma.stockInventory.create({
          data: {
            code: parsed.code,
            ...newImage.data,
            productName: parsed.productName,
            spec: parsed.spec,
            unit: parsed.unit,
            stock: initialStock,
            stockMax: resolveStockChange({
              previousStock: null,
              previousStockMax: null,
              stock: initialStock,
              stockMax: parsed.stockMax ?? undefined,
            }).stockMax,
            effectiveDate: parsed.effectiveDate,
            priceOver500man: parsed.priceOver500man,
            priceOver100man: parsed.priceOver100man,
            wholesalePrice: parsed.wholesalePrice,
            associatePrice: parsed.associatePrice,
            category: parsed.category,
          },
        });
        await recordAdminStockChange(this.prisma, {
          productId: created.id,
          productName: created.productName,
          previousStock: null,
          nextStock: created.stock,
        });
        summary.created += 1;
        createdCodes.push(parsed.code);
      } catch (error) {
        summary.failed += 1;
        failed.push({
          row: rowNumber,
          code: code || undefined,
          reason:
            error instanceof Error
              ? error.message
              : '알 수 없는 오류로 등록에 실패했습니다.',
        });
      }
    }

    return {
      message: '재고/상품 일괄 등록이 완료되었습니다.',
      summary,
      createdCodes,
      updatedCodes,
      skippedCodes,
      failed,
    };
  }
}
