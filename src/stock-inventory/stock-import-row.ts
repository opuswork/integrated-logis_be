import * as XLSX from 'xlsx';

/** xlsx 의 SSF 헬퍼는 타입 선언이 any 라서 필요한 부분만 좁혀 쓴다. */
const SSF = XLSX.SSF as {
  parse_date_code(
    value: number,
  ): { y: number; m: number; d: number } | false | undefined;
};

/**
 * 재고/상품 Excel 일괄 업로드 한 행을 파싱한다.
 *
 * 이미 등록된 코드(`existing`)가 있으면 비어 있는 칸은 기존 값을 그대로 쓴다.
 * 재고만 올리려고 단위·적용일자·가격 12칸을 다시 채우지 않아도 되게 하기 위함이다.
 */
export type StockImportDefaults = {
  productName: string;
  spec: string | null;
  unit: number;
  effectiveDate: Date;
  priceOver500man: number | { toNumber(): number };
  priceOver100man: number | { toNumber(): number };
  wholesalePrice: number | { toNumber(): number };
  associatePrice: number | { toNumber(): number };
  category: string;
};

export type ParsedRow = {
  code: string;
  /**
   * 사진 칸. `undefined` = 빈 칸이라 기존 사진 유지, `null` = 사진 삭제,
   * 문자열 = 이미지 URL. 셀에 직접 넣은 사진은 여기 오지 않는다.
   */
  imageUrl?: string | null;
  productName: string;
  spec?: string | null;
  unit: number;
  stock?: number | null;
  stockMax?: number | null;
  /** 이번에 추가 입고한 수량. 남은 수량과 누적 총 입고량에 함께 더해진다. */
  stockIn?: number | null;
  effectiveDate: Date;
  priceOver500man: number;
  priceOver100man: number;
  wholesalePrice: number;
  associatePrice: number;
  category: string;
};

export function normalizeHeader(value: unknown) {
  return toDisplayString(value)
    .replace(/\s+/g, '')
    .replace(/\n/g, '')
    .toLowerCase();
}

/** Prisma Decimal 과 number 를 모두 받아 number 로 만든다. */
function toNumber(value: number | { toNumber(): number }): number {
  return typeof value === 'number' ? value : value.toNumber();
}

export function parsePrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const cleaned = toDisplayString(value)
    .replace(/,/g, '')
    .replace(/₩/g, '')
    .replace(/원/g, '')
    .trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`가격을 파싱할 수 없습니다: ${toDisplayString(value)}`);
  }
  return n;
}

export function parseOptionalStock(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = toDisplayString(value);
  if (raw === '' || raw.toLowerCase() === 'null' || raw === '-') {
    return null;
  }
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`재고 수량을 파싱할 수 없습니다: ${raw}`);
  }
  return Math.trunc(n);
}

export function parseUnit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }
  const raw = toDisplayString(value);
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`단위를 파싱할 수 없습니다: ${raw}`);
  }
  return Math.trunc(n);
}

export function parseEffectiveDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date
    const parsed = SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }

  const raw = toDisplayString(value);
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

  throw new Error(`적용일자를 파싱할 수 없습니다: ${raw}`);
}

/**
 * 별칭으로 셀을 찾는다. 정확히 일치하는 헤더를 먼저 보고, 없으면 부분 일치로 넓힌다
 * (엑셀 헤더가 길게 풀어 쓰여 있는 경우가 많다).
 *
 * `skipKeys` 는 다른 열이 이미 차지한 헤더다. `stock`/`stockIn` 처럼 한쪽 별칭이
 * 다른 쪽 헤더의 부분 문자열인 경우 부분 일치가 엉뚱한 열을 집어오는 것을 막는다.
 */
export function pickEntry(
  row: Record<string, unknown>,
  aliases: string[],
  skipKeys: ReadonlySet<string> = new Set(),
): { key: string; value: unknown } | undefined {
  const entries = Object.entries(row).filter(
    // __rowNum__ 은 SheetJS 가 붙인 메타 키라 열로 취급하면 안 된다
    ([key]) => key !== '__rowNum__' && !skipKeys.has(key),
  );
  const hasValue = (entry: [string, unknown]) =>
    entry[1] != null && toDisplayString(entry[1]) !== '';

  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const hit = entries.find(([key]) => normalizeHeader(key) === target);
    if (hit && hasValue(hit)) {
      return { key: hit[0], value: hit[1] };
    }
  }
  // Fuzzy contains match (Excel headers can be long)
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const hit = entries.find(([key]) => normalizeHeader(key).includes(target));
    if (hit && hasValue(hit)) {
      return { key: hit[0], value: hit[1] };
    }
  }
  return undefined;
}

export function pickField(
  row: Record<string, unknown>,
  aliases: string[],
  skipKeys?: ReadonlySet<string>,
): unknown {
  return pickEntry(row, aliases, skipKeys)?.value;
}

/** 파싱에 실패한 행을 화면에 그대로 보여줄 때 쓰는 안전한 문자열 변환. */
export function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return '';
}

/** 행에서 코드만 먼저 뽑는다 (기존 상품을 조회해 기본값으로 쓰기 위해). */
export function pickCode(row: Record<string, unknown>): string {
  return toDisplayString(pickField(row, ['코드', 'code']));
}

/**
 * 시트의 실제 엑셀 행 번호(1-based).
 *
 * SheetJS 는 빈 행을 건너뛰므로 배열 인덱스로 계산하면 어긋난다.
 * sheet_to_json 이 붙여주는 __rowNum__(0-based)을 쓴다. 셀에 넣은 사진을
 * 올바른 행에 연결하려면 이 값이 정확해야 한다.
 */
export function pickRowNumber(
  row: Record<string, unknown>,
  fallback: number,
): number {
  const raw = row['__rowNum__'];
  return typeof raw === 'number' && Number.isInteger(raw) ? raw + 1 : fallback;
}

/** 엑셀 오류값(#VALUE! 등). '셀에 배치' 사진 셀이 이렇게 읽힌다. */
const EXCEL_ERROR = /^#(VALUE|REF|NAME|DIV\/0|N\/A|NULL|NUM)[!?]?$/i;

/** 사진을 지우라는 표시 */
const IMAGE_CLEAR_TOKENS = new Set(['-', '삭제', 'x', 'X', '없음']);

/**
 * 사진 칸을 세 상태로 읽는다.
 * - `undefined` : 빈 칸 → 기존 사진을 그대로 둔다
 * - `null`      : '-' / '삭제' → 사진을 지운다
 * - 문자열      : 이미지 URL
 *
 * 셀에 직접 넣은 사진은 여기서 값이 잡히지 않는다(오류값 또는 빈 칸으로 읽힘).
 * 그건 stock-import-images 가 따로 꺼낸다.
 */
export function parseImageCell(value: unknown): string | null | undefined {
  const raw = toDisplayString(value);
  if (raw === '') return undefined;
  if (EXCEL_ERROR.test(raw)) return undefined;
  if (IMAGE_CLEAR_TOKENS.has(raw)) return null;
  return raw;
}

export function mapExcelRow(
  row: Record<string, unknown>,
  existing?: StockImportDefaults | null,
): ParsedRow {
  const code = pickCode(row);
  const productNameRaw = toDisplayString(
    pickField(row, ['품명', 'productName', '상품명']),
  );
  const categoryRaw = toDisplayString(pickField(row, ['구분', 'category']));

  if (!code) {
    throw new Error('코드가 없습니다.');
  }

  const productName = productNameRaw || existing?.productName || '';
  const category = categoryRaw || existing?.category || '';

  if (!productName) {
    throw new Error('품명이 없습니다.');
  }
  if (!category) {
    throw new Error('구분이 없습니다.');
  }

  const imageRaw = pickField(row, ['사진', 'imageUrl', '이미지']);
  const specRaw = pickField(row, ['규격', 'spec']);
  const unitRaw = pickField(row, ['단위', 'unit']);
  const effectiveDateRaw = pickField(row, ['적용일자', 'effectiveDate']);

  // 입고수량을 먼저 확정하고 그 헤더를 재고 탐색에서 제외한다
  // ('stock' 부분 일치가 'stockIn' 열을 집어가는 것을 막는다).
  const stockInEntry = pickEntry(row, [
    '입고수량',
    '추가입고',
    'stockIn',
    '입고',
  ]);
  const taken = new Set(stockInEntry ? [stockInEntry.key] : []);
  const stockRaw = pickField(row, ['재고', 'stock', '재고수량'], taken);

  /** 칸이 비어 있고 기존 상품이 있으면 기존 값을 쓴다. */
  const withFallback = <T>(
    raw: unknown,
    parse: (value: unknown) => T,
    fallback: (() => T) | null,
  ): T => {
    if (raw === undefined || raw === null || toDisplayString(raw) === '') {
      if (fallback) {
        return fallback();
      }
    }
    return parse(raw);
  };

  const price = (aliases: string[], fallbackKey: keyof StockImportDefaults) =>
    withFallback(
      pickField(row, aliases),
      parsePrice,
      existing
        ? () =>
            toNumber(existing[fallbackKey] as number | { toNumber(): number })
        : null,
    );

  return {
    code,
    imageUrl: parseImageCell(imageRaw),
    productName,
    spec: toDisplayString(specRaw) || (existing?.spec ?? null),
    unit: withFallback(
      unitRaw,
      parseUnit,
      existing ? () => existing.unit : null,
    ),
    stock: parseOptionalStock(stockRaw),
    stockMax: parseOptionalStock(
      pickField(row, ['최대재고', '기준재고', 'stockMax', '재고최대'], taken),
    ),
    stockIn: parseOptionalStock(stockInEntry?.value),
    effectiveDate: withFallback(
      effectiveDateRaw,
      parseEffectiveDate,
      existing ? () => existing.effectiveDate : null,
    ),
    priceOver500man: price(
      [
        '전체500만원이상주문시할인가격',
        '500만원이상',
        'priceOver500man',
        'price_500',
      ],
      'priceOver500man',
    ),
    priceOver100man: price(
      [
        '전체100만원이상주문시할인가격',
        '100만원이상',
        'priceOver100man',
        'price_100',
      ],
      'priceOver100man',
    ),
    wholesalePrice: price(
      ['도매(기본적용가격)', '도매', '기본적용가격', 'wholesalePrice', 'price'],
      'wholesalePrice',
    ),
    associatePrice: price(['준회원', 'associatePrice'], 'associatePrice'),
    category,
  };
}
