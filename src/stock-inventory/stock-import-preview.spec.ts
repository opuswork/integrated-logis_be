import { createHash } from 'crypto';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

import { StockInventoryService } from './stock-inventory.service';

type ExistingProduct = {
  id: number;
  code: string;
  productName: string;
  spec: string | null;
  unit: number;
  stock: number | null;
  stockMax: number | null;
  effectiveDate: Date;
  priceOver500man: number;
  priceOver100man: number;
  wholesalePrice: number;
  associatePrice: number;
  category: string;
  imageHash?: string | null;
};

const EXISTING: ExistingProduct[] = [
  {
    id: 1,
    code: 'A-002',
    productName: '기름1호',
    spec: '1L',
    unit: 1,
    stock: 9985,
    stockMax: 10000,
    effectiveDate: new Date('2025-06-01T00:00:00.000Z'),
    priceOver500man: 10000,
    priceOver100man: 11000,
    wholesalePrice: 12000,
    associatePrice: 13000,
    category: '일반품',
  },
];

/** previewImportFromFile 는 stockInventory.findMany 만 쓴다. */
function buildService(overrides: Partial<ExistingProduct> = {}) {
  const products = EXISTING.map((p) => ({ ...p, ...overrides }));
  const prisma = {
    stockInventory: {
      findMany: ({ where }: { where: { code: { in: string[] } } }) =>
        Promise.resolve(products.filter((p) => where.code.in.includes(p.code))),
    },
  };
  return new StockInventoryService(prisma as never, {} as never);
}

function toXlsxFile(rows: unknown[][]): Express.Multer.File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '재고업로드');
  const buffer = XLSX.write(book, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;
  return { buffer } as Express.Multer.File;
}

const HEADER = [
  '코드',
  '품명',
  '규격',
  '단위',
  '재고',
  '입고수량',
  '적용일자',
  '도매(기본적용가격)',
  '구분',
];

describe('previewImportFromFile (재고 엑셀업로드 미리보기)', () => {
  it('신규/수정/오류 행을 구분하고 적용 후 재고를 계산한다', async () => {
    const service = buildService();
    const file = toXlsxFile([
      HEADER,
      // 신규 등록
      [
        'A-001',
        '감사1호',
        '500ml x 2',
        2,
        300,
        '',
        '2026-01-01',
        50000,
        '선물세트',
      ],
      // 기존 코드에 500 입고 → 9985 + 500
      ['A-002', '', '', '', '', 500, '', '', ''],
      // 코드 없음 → 오류
      ['', '이름만있음', '', 1, '', '', '2026-01-01', 1000, '일반품'],
    ]);

    const result = await service.previewImportFromFile(file);

    expect(result.summary).toEqual({
      total: 3,
      create: 1,
      update: 1,
      invalid: 1,
      imageChanged: 0,
    });

    const [created, updated, invalid] = result.rows;

    expect(created).toMatchObject({
      rowNumber: 2,
      status: 'CREATE',
      code: 'A-001',
      productName: '감사1호',
      currentStock: null,
      stock: 300,
      nextStock: 300,
    });

    // 기존 상품의 단위/가격/구분이 그대로 채워지고 입고분만 가산된다
    expect(updated).toMatchObject({
      rowNumber: 3,
      status: 'UPDATE',
      code: 'A-002',
      productName: '기름1호',
      unit: 1,
      category: '일반품',
      wholesalePrice: 12000,
      currentStock: 9985,
      stockIn: 500,
      nextStock: 10485,
    });

    expect(invalid).toMatchObject({
      rowNumber: 4,
      status: 'INVALID',
      error: '코드가 없습니다.',
    });
  });

  it('재고 칸만 채우면 실사 정정(절대값)으로 계산한다', async () => {
    const service = buildService();
    const file = toXlsxFile([
      HEADER,
      ['A-002', '', '', '', 200, '', '', '', ''],
    ]);

    const result = await service.previewImportFromFile(file);
    expect(result.rows[0]).toMatchObject({
      status: 'UPDATE',
      currentStock: 9985,
      stock: 200,
      stockIn: null,
      nextStock: 200,
    });
  });

  it('재고/입고수량이 모두 비면 기존 재고를 유지한다', async () => {
    const service = buildService();
    const file = toXlsxFile([
      HEADER,
      ['A-002', '', '', '', '', '', '', '', ''],
    ]);

    const result = await service.previewImportFromFile(file);
    expect(result.rows[0]).toMatchObject({
      status: 'UPDATE',
      currentStock: 9985,
      nextStock: 9985,
    });
  });

  it('중간에 빈 행이 있어도 엑셀 실제 행 번호를 쓴다', async () => {
    const service = buildService();
    const file = toXlsxFile([
      HEADER,
      ['A-002', '', '', '', '', 100, '', '', ''],
      [], // 빈 행 — SheetJS 는 건너뛴다
      ['A-002', '', '', '', '', 200, '', '', ''],
    ]);

    const result = await service.previewImportFromFile(file);
    // index+2 로 계산하면 2,3 이 되지만 실제로는 2,4 다
    expect(result.rows.map((r) => r.rowNumber)).toEqual([2, 4]);
  });

  it('빈 파일은 400으로 거절한다', async () => {
    const service = buildService();
    await expect(service.previewImportFromFile(undefined)).rejects.toThrow(
      /파일을 업로드/,
    );
  });
});

/** 1x1 PNG 두 장 (서로 다른 해시) */
const PNG_A = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_B = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_A_SHA = createHash('sha256').update(PNG_A).digest('hex');

/** 사진 열(B)에 이미지를 앵커한 xlsx 를 만든다. */
async function toXlsxFileWithPhotos(
  dataRows: unknown[][],
  photos: Array<{ row: number; buffer: Buffer }>,
): Promise<Express.Multer.File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('재고업로드');
  ws.addRow(['코드', '사진', '품명', '단위', '적용일자', '구분']);
  dataRows.forEach((r) => ws.addRow(r));

  for (const photo of photos) {
    const id = wb.addImage({
      buffer: photo.buffer as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
    ws.addImage(id, {
      tl: { col: 1, row: photo.row - 1 }, // B열(0-based 1)
      br: { col: 2, row: photo.row },
    } as unknown as Parameters<typeof ws.addImage>[1]);
  }

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  } as Express.Multer.File;
}

describe('previewImportFromFile — 셀에 넣은 사진', () => {
  it('기존 상품에 해시가 다른 사진이면 CHANGED 로 표시한다', async () => {
    const service = buildService({ imageHash: 'old-hash-value' });
    const file = await toXlsxFileWithPhotos(
      [['A-002', '', '', '', '', '']],
      [{ row: 2, buffer: PNG_A }],
    );

    const result = await service.previewImportFromFile(file);
    expect(result.rows[0].imageStatus).toBe('CHANGED');
    expect(result.summary.imageChanged).toBe(1);
    expect(result.rows[0].imageThumbnail).toMatch(/^data:image\/png;base64,/);
  });

  it('해시가 같으면 SAME 이고 변경 건수에 넣지 않는다', async () => {
    const service = buildService({ imageHash: PNG_A_SHA });
    const file = await toXlsxFileWithPhotos(
      [['A-002', '', '', '', '', '']],
      [{ row: 2, buffer: PNG_A }],
    );

    const result = await service.previewImportFromFile(file);
    expect(result.rows[0].imageStatus).toBe('SAME');
    expect(result.summary.imageChanged).toBe(0);
  });

  it('신규 상품의 사진은 NEW 로 표시한다', async () => {
    const service = buildService();
    const file = await toXlsxFileWithPhotos(
      [['ZZ-NEW', '', '새상품', 1, '2026-01-01', '일반품']],
      [{ row: 2, buffer: PNG_B }],
    );

    const result = await service.previewImportFromFile(file);
    expect(result.rows[0].status).toBe('CREATE');
    expect(result.rows[0].imageStatus).toBe('NEW');
  });

  it('사진 칸이 비면 NONE (기존 사진 유지)', async () => {
    const service = buildService({ imageHash: PNG_A_SHA });
    const file = await toXlsxFileWithPhotos(
      [['A-002', '', '', '', '', '']],
      [],
    );

    const result = await service.previewImportFromFile(file);
    expect(result.rows[0].imageStatus).toBe('NONE');
    expect(result.rows[0].imageThumbnail).toBeNull();
  });

  it("사진 칸에 '-' 를 쓰면 REMOVE", async () => {
    const service = buildService({ imageHash: PNG_A_SHA });
    const file = await toXlsxFileWithPhotos(
      [['A-002', '-', '', '', '', '']],
      [],
    );

    const result = await service.previewImportFromFile(file);
    expect(result.rows[0].imageStatus).toBe('REMOVE');
  });
});
