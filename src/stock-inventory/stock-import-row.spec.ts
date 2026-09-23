import {
  mapExcelRow,
  parseImageCell,
  pickCode,
  pickRowNumber,
  type StockImportDefaults,
} from './stock-import-row';

const FULL_ROW = {
  코드: 'A-001',
  품명: '감사1호',
  규격: '500ml x 2',
  단위: 2,
  적용일자: '2026-01-01',
  전체500만원이상주문시할인가격: 45000,
  전체100만원이상주문시할인가격: 47000,
  '도매(기본적용가격)': 50000,
  준회원: 52000,
  구분: '선물세트',
};

const EXISTING: StockImportDefaults = {
  productName: '감사1호',
  spec: '500ml x 2',
  unit: 2,
  effectiveDate: new Date('2025-06-01T00:00:00.000Z'),
  priceOver500man: 45000,
  priceOver100man: 47000,
  wholesalePrice: 50000,
  associatePrice: 52000,
  category: '선물세트',
};

describe('mapExcelRow (재고/상품 엑셀 일괄 업로드 행 파싱)', () => {
  it('필수 칸이 모두 있는 신규 행을 파싱한다', () => {
    const parsed = mapExcelRow(FULL_ROW);
    expect(parsed.code).toBe('A-001');
    expect(parsed.productName).toBe('감사1호');
    expect(parsed.unit).toBe(2);
    expect(parsed.wholesalePrice).toBe(50000);
    expect(parsed.category).toBe('선물세트');
  });

  it('코드/품명/구분이 없으면 실패한다', () => {
    expect(() => mapExcelRow({ ...FULL_ROW, 코드: '' })).toThrow(
      '코드가 없습니다.',
    );
    expect(() => mapExcelRow({ ...FULL_ROW, 품명: '' })).toThrow(
      '품명이 없습니다.',
    );
    expect(() => mapExcelRow({ ...FULL_ROW, 구분: '' })).toThrow(
      '구분이 없습니다.',
    );
  });

  it('신규 행은 단위/적용일자가 없으면 실패한다', () => {
    expect(() => mapExcelRow({ ...FULL_ROW, 단위: '' })).toThrow(/단위/);
    expect(() => mapExcelRow({ ...FULL_ROW, 적용일자: '' })).toThrow(
      /적용일자/,
    );
  });

  it('입고수량을 파싱한다 (천단위 콤마 허용)', () => {
    expect(mapExcelRow({ ...FULL_ROW, 입고수량: '1,000' }).stockIn).toBe(1000);
    expect(mapExcelRow({ ...FULL_ROW, 입고수량: 500 }).stockIn).toBe(500);
    expect(mapExcelRow({ ...FULL_ROW, 입고수량: '' }).stockIn).toBeNull();
  });

  it('입고수량과 재고를 서로 다른 열로 구분한다', () => {
    const parsed = mapExcelRow({ ...FULL_ROW, 재고: 300, 입고수량: 500 });
    expect(parsed.stock).toBe(300);
    expect(parsed.stockIn).toBe(500);
  });

  it('영문 헤더에서도 stock 과 stockIn 이 섞이지 않는다', () => {
    const parsed = mapExcelRow({
      code: 'A-001',
      productName: '감사1호',
      category: '선물세트',
      unit: 1,
      effectiveDate: '2026-01-01',
      stockIn: 500,
    });
    expect(parsed.stockIn).toBe(500);
    expect(parsed.stock).toBeNull();
  });

  it('기존 상품이 있으면 빈 단위/적용일자/가격을 기존 값으로 채운다', () => {
    const parsed = mapExcelRow({ 코드: 'A-001', 입고수량: 500 }, EXISTING);
    expect(parsed.productName).toBe('감사1호');
    expect(parsed.category).toBe('선물세트');
    expect(parsed.unit).toBe(2);
    expect(parsed.effectiveDate).toEqual(EXISTING.effectiveDate);
    expect(parsed.wholesalePrice).toBe(50000);
    expect(parsed.stockIn).toBe(500);
    expect(parsed.stock).toBeNull();
  });

  it('기존 상품이 있어도 엑셀에 적힌 값이 우선한다', () => {
    const parsed = mapExcelRow(
      {
        코드: 'A-001',
        품명: '감사1호(개정)',
        단위: 4,
        '도매(기본적용가격)': 60000,
      },
      EXISTING,
    );
    expect(parsed.productName).toBe('감사1호(개정)');
    expect(parsed.unit).toBe(4);
    expect(parsed.wholesalePrice).toBe(60000);
  });

  it('Prisma Decimal 형태의 기존 가격도 숫자로 변환한다', () => {
    const parsed = mapExcelRow(
      { 코드: 'A-001' },
      { ...EXISTING, wholesalePrice: { toNumber: () => 50000 } },
    );
    expect(parsed.wholesalePrice).toBe(50000);
  });

  it('pickCode 는 헤더 별칭과 공백을 흡수한다', () => {
    expect(pickCode({ ' 코드 ': ' A-001 ' })).toBe('A-001');
    expect(pickCode({ code: 'B-002' })).toBe('B-002');
    expect(pickCode({ 품명: '감사1호' })).toBe('');
  });
});

describe('parseImageCell (사진 칸 3상태)', () => {
  it('빈 칸은 undefined — 기존 사진을 유지한다', () => {
    expect(parseImageCell('')).toBeUndefined();
    expect(parseImageCell(null)).toBeUndefined();
    expect(parseImageCell('   ')).toBeUndefined();
  });

  it("'-' / '삭제' 는 null — 사진을 지운다", () => {
    expect(parseImageCell('-')).toBeNull();
    expect(parseImageCell('삭제')).toBeNull();
  });

  it('URL 문자열은 그대로 쓴다', () => {
    expect(parseImageCell('https://x.test/a.png')).toBe('https://x.test/a.png');
  });

  it("'셀에 배치' 사진이 남기는 #VALUE! 를 URL 로 오해하지 않는다", () => {
    expect(parseImageCell('#VALUE!')).toBeUndefined();
    expect(parseImageCell('#REF!')).toBeUndefined();
  });
});

describe('pickRowNumber', () => {
  it('__rowNum__ 이 있으면 실제 엑셀 행 번호를 쓴다', () => {
    expect(pickRowNumber({ __rowNum__: 3 }, 99)).toBe(4);
    expect(pickRowNumber({ __rowNum__: 0 }, 99)).toBe(1);
  });

  it('없으면 폴백 값을 쓴다', () => {
    expect(pickRowNumber({}, 7)).toBe(7);
  });

  it('__rowNum__ 을 열로 착각하지 않는다', () => {
    const parsed = mapExcelRow({ __rowNum__: 5, 코드: 'A-001' }, EXISTING);
    expect(parsed.code).toBe('A-001');
    expect(parsed.productName).toBe('감사1호');
  });
});
