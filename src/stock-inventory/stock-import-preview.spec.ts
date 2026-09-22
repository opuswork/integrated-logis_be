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
function buildService() {
  const prisma = {
    stockInventory: {
      findMany: ({ where }: { where: { code: { in: string[] } } }) =>
        Promise.resolve(EXISTING.filter((p) => where.code.in.includes(p.code))),
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

  it('빈 파일은 400으로 거절한다', async () => {
    const service = buildService();
    await expect(service.previewImportFromFile(undefined)).rejects.toThrow(
      /파일을 업로드/,
    );
  });
});
