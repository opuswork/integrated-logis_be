import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockInventoryDto,
  ReplaceStockInventoryDto,
  UpdateStockInventoryDto,
} from './dto/stock-inventory.dto';
import { ProductImageStorageService } from './product-image-storage.service';

type ParsedRow = {
  code: string;
  imageUrl?: string | null;
  productName: string;
  spec?: string | null;
  unit: number;
  stock?: number | null;
  stockMax?: number | null;
  effectiveDate: Date;
  priceOver500man: number;
  priceOver100man: number;
  wholesalePrice: number;
  associatePrice: number;
  category: string;
};

/** When stock is set and capacity is missing, capacity = initial stock (e.g. 3 → 3/3). */
function resolveStockMax(
  stock: number | null | undefined,
  stockMax: number | null | undefined,
) {
  if (stock === null || stock === undefined) {
    return stockMax ?? null;
  }
  if (stockMax === null || stockMax === undefined) {
    return stock;
  }
  return stockMax;
}

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/\n/g, '')
    .trim()
    .toLowerCase();
}

function parsePrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const cleaned = String(value ?? '')
    .replace(/,/g, '')
    .replace(/₩/g, '')
    .replace(/원/g, '')
    .trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`가격을 파싱할 수 없습니다: ${String(value)}`);
  }
  return n;
}

function parseOptionalStock(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = String(value).trim();
  if (raw === '' || raw.toLowerCase() === 'null' || raw === '-') {
    return null;
  }
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`재고 수량을 파싱할 수 없습니다: ${String(value)}`);
  }
  return Math.trunc(n);
}

function parseUnit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`단위를 파싱할 수 없습니다: ${String(value)}`);
  }
  return Math.trunc(n);
}

function parseEffectiveDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }

  const raw = String(value ?? '').trim();
  if (/^\d{8}$/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6));
    const d = Number(raw.slice(6, 8));
    return new Date(Date.UTC(y, m - 1, d));
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  throw new Error(`적용일자를 파싱할 수 없습니다: ${String(value)}`);
}

function pickField(
  row: Record<string, unknown>,
  aliases: string[],
): unknown {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const hit = entries.find(([key]) => normalizeHeader(key) === target);
    if (hit && hit[1] != null && String(hit[1]).trim() !== '') {
      return hit[1];
    }
  }
  // Fuzzy contains match (Excel headers can be long)
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const hit = entries.find(([key]) =>
      normalizeHeader(key).includes(target),
    );
    if (hit && hit[1] != null && String(hit[1]).trim() !== '') {
      return hit[1];
    }
  }
  return undefined;
}

function mapExcelRow(row: Record<string, unknown>): ParsedRow {
  const code = String(pickField(row, ['코드', 'code']) ?? '').trim();
  const productName = String(
    pickField(row, ['품명', 'productName', '상품명']) ?? '',
  ).trim();
  const category = String(
    pickField(row, ['구분', 'category']) ?? '',
  ).trim();

  if (!code) {
    throw new Error('코드가 없습니다.');
  }
  if (!productName) {
    throw new Error('품명이 없습니다.');
  }
  if (!category) {
    throw new Error('구분이 없습니다.');
  }

  const imageRaw = pickField(row, ['사진', 'imageUrl', '이미지']);
  const specRaw = pickField(row, ['규격', 'spec']);

  return {
    code,
    imageUrl:
      imageRaw != null && String(imageRaw).trim() !== ''
        ? String(imageRaw).trim()
        : null,
    productName,
    spec:
      specRaw != null && String(specRaw).trim() !== ''
        ? String(specRaw).trim()
        : null,
    unit: parseUnit(pickField(row, ['단위', 'unit'])),
    stock: parseOptionalStock(pickField(row, ['재고', 'stock', '재고수량'])),
    stockMax: parseOptionalStock(
      pickField(row, ['최대재고', '기준재고', 'stockMax', '재고최대']),
    ),
    effectiveDate: parseEffectiveDate(
      pickField(row, ['적용일자', 'effectiveDate']),
    ),
    priceOver500man: parsePrice(
      pickField(row, [
        '전체500만원이상주문시할인가격',
        '500만원이상',
        'priceOver500man',
        'price_500',
      ]),
    ),
    priceOver100man: parsePrice(
      pickField(row, [
        '전체100만원이상주문시할인가격',
        '100만원이상',
        'priceOver100man',
        'price_100',
      ]),
    ),
    wholesalePrice: parsePrice(
      pickField(row, [
        '도매(기본적용가격)',
        '도매',
        '기본적용가격',
        'wholesalePrice',
        'price',
      ]),
    ),
    associatePrice: parsePrice(
      pickField(row, ['준회원', 'associatePrice']),
    ),
    category,
  };
}

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

  async create(
    dto: CreateStockInventoryDto,
    file?: Express.Multer.File,
  ) {
    const code = dto.code.trim();
    const existing = await this.prisma.stockInventory.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`이미 등록된 코드입니다: ${code}`);
    }

    const image = await this.resolveImageFields(file, dto.imageUrl);

    return this.prisma.stockInventory.create({
      data: {
        code,
        imageUrl: image.imageUrl,
        imageStoredName: image.imageStoredName,
        imageOriginalName: image.imageOriginalName,
        productName: dto.productName.trim(),
        spec: dto.spec?.trim() || null,
        unit: dto.unit,
        stock: dto.stock ?? null,
        stockMax: resolveStockMax(dto.stock ?? null, dto.stockMax ?? null),
        effectiveDate: new Date(dto.effectiveDate),
        priceOver500man: dto.priceOver500man,
        priceOver100man: dto.priceOver100man,
        wholesalePrice: dto.wholesalePrice,
        associatePrice: dto.associatePrice,
        category: dto.category.trim(),
        openStock: dto.openStock ?? true,
      },
    });
  }

  findAll(category?: string, keyword?: string, openOnly = false) {
    const normalizedKeyword = keyword?.trim();
    return this.prisma.stockInventory.findMany({
      where: {
        ...(openOnly ? { openStock: true } : undefined),
        ...(category?.trim()
          ? { category: category.trim() }
          : undefined),
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

    return this.prisma.stockInventory.update({
      where: { id },
      data: {
        code: dto.code.trim(),
        imageUrl: image.imageUrl,
        imageStoredName: image.imageStoredName,
        imageOriginalName: image.imageOriginalName,
        productName: dto.productName.trim(),
        spec: dto.spec?.trim() || null,
        unit: dto.unit,
        stock: dto.stock ?? null,
        stockMax: resolveStockMax(dto.stock ?? null, dto.stockMax ?? null),
        effectiveDate: new Date(dto.effectiveDate),
        priceOver500man: dto.priceOver500man,
        priceOver100man: dto.priceOver100man,
        wholesalePrice: dto.wholesalePrice,
        associatePrice: dto.associatePrice,
        category: dto.category.trim(),
        openStock: dto.openStock ?? true,
      },
    });
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
          throw new ConflictException(
            `이미 등록된 코드입니다: ${nextCode}`,
          );
        }
      }
    }

    return this.prisma.stockInventory.update({
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
        ...(dto.spec !== undefined
          ? { spec: dto.spec?.trim() || null }
          : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.stock !== undefined || dto.stockMax !== undefined
          ? {
              ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
              stockMax: resolveStockMax(
                dto.stock !== undefined ? dto.stock : current.stock,
                dto.stockMax !== undefined ? dto.stockMax : current.stockMax,
              ),
            }
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
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.stockInventory.delete({ where: { id } });
  }

  async bulkImportFromFile(
    file: Express.Multer.File | undefined,
    skipExisting = true,
  ) {
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

    const summary = {
      requested: rows.length,
      created: 0,
      skipped: 0,
      failed: 0,
    };
    const createdCodes: string[] = [];
    const skippedCodes: string[] = [];
    const failed: Array<{ code?: string; reason: string }> = [];

    for (const row of rows) {
      try {
        const parsed = mapExcelRow(row);
        const existing = await this.prisma.stockInventory.findUnique({
          where: { code: parsed.code },
          select: { id: true },
        });

        if (existing) {
          if (skipExisting) {
            summary.skipped += 1;
            skippedCodes.push(parsed.code);
            continue;
          }
          await this.prisma.stockInventory.update({
            where: { code: parsed.code },
            data: {
              imageUrl: parsed.imageUrl,
              productName: parsed.productName,
              spec: parsed.spec,
              unit: parsed.unit,
              stock: parsed.stock,
              stockMax: resolveStockMax(
                parsed.stock ?? null,
                parsed.stockMax ?? null,
              ),
              effectiveDate: parsed.effectiveDate,
              priceOver500man: parsed.priceOver500man,
              priceOver100man: parsed.priceOver100man,
              wholesalePrice: parsed.wholesalePrice,
              associatePrice: parsed.associatePrice,
              category: parsed.category,
            },
          });
          summary.created += 1;
          createdCodes.push(parsed.code);
          continue;
        }

        await this.prisma.stockInventory.create({
          data: {
            code: parsed.code,
            imageUrl: parsed.imageUrl,
            productName: parsed.productName,
            spec: parsed.spec,
            unit: parsed.unit,
            stock: parsed.stock,
            stockMax: resolveStockMax(
              parsed.stock ?? null,
              parsed.stockMax ?? null,
            ),
            effectiveDate: parsed.effectiveDate,
            priceOver500man: parsed.priceOver500man,
            priceOver100man: parsed.priceOver100man,
            wholesalePrice: parsed.wholesalePrice,
            associatePrice: parsed.associatePrice,
            category: parsed.category,
          },
        });
        summary.created += 1;
        createdCodes.push(parsed.code);
      } catch (error) {
        summary.failed += 1;
        failed.push({
          code: String(pickField(row, ['코드', 'code']) ?? '') || undefined,
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
      skippedCodes,
      failed,
    };
  }
}
