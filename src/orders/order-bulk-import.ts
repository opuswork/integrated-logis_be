import * as XLSX from 'xlsx';

import { extractGreetingSheetImages } from './excel-greeting-images.js';

export type ParsedMasterRow = {
  orderNumber: string;
  orderStatusLabel: string;
  orderType: string;
  orderDate: string;
  branchStore: string;
  churchName: string;
  ordererName: string;
  phone: string;
  parcelShipDate: string;
  deliveryDateTime: string;
  clientContactName: string;
  clientContactPhone: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  greetingNumber: string;
  businessCard: string;
  greetingSelf: string;
  specialNote: string;
  manager: string;
  remark: string;
  rowIndex: number;
};

export type ParsedDetailRow = {
  orderNumber: string;
  seq: number;
  shipType: string;
  productCode: string;
  productName: string;
  quantity: number;
  requestNote: string;
  unitPrice: number;
  shipStatus: string;
  remark: string;
  rowIndex: number;
};

export type ParsedGreetingRow = {
  orderNumber: string;
  greetingNumber: string;
  includeSelf: boolean;
  content: string;
  quantity: number;
  size: string;
  productName: string;
  receivePlace: string;
  specialNote: string;
  businessCard: string;
  ordererName: string;
  churchName: string;
  phone: string;
  rowIndex: number;
  imageBuffer?: Buffer;
  imageExtension?: string;
};

const MASTER_SHEET = '06_주문마스터_데이터';
const DETAIL_SHEET = '07_상품상세_데이터';
const GREETING_SHEET = '08_인사장_데이터';
const MASTER_HEADER_ROW = 5; // 1-based
const DETAIL_HEADER_ROW = 3;
const MASTER_DATA_START = 6;
const DETAIL_DATA_START = 4;

function cellToString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateValue(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // May be excel serial date — leave as number string for callers that expect qty
    return String(value);
  }
  const raw = String(value).trim();
  if (raw.toLowerCase() === 'null') {
    return '';
  }
  return raw;
}

function formatDateValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = date.getUTCHours();
  const mm = date.getUTCMinutes();
  if (hh === 0 && mm === 0) {
    return `${y}-${m}-${d}`;
  }
  const hs = String(hh).padStart(2, '0');
  const ms = String(mm).padStart(2, '0');
  return `${y}-${m}-${d} ${hs}:${ms}`;
}

function excelSerialToDate(serial: number): Date | null {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) {
    return null;
  }
  return new Date(
    Date.UTC(
      parsed.y,
      parsed.m - 1,
      parsed.d,
      parsed.H || 0,
      parsed.M || 0,
      parsed.S || 0,
    ),
  );
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/✓/g, '')
    .replace(/\s+/g, '')
    .replace(/\n/g, '')
    .trim()
    .toLowerCase();
}

function headerIndexMap(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (key) {
      map.set(key, index);
    }
  });
  return map;
}

function pickByHeader(
  row: unknown[],
  headers: Map<string, number>,
  aliases: string[],
): unknown {
  for (const alias of aliases) {
    const idx = headers.get(normalizeHeader(alias));
    if (idx !== undefined && row[idx] !== undefined && row[idx] !== null) {
      const text = cellToString(row[idx]);
      if (text !== '' || typeof row[idx] === 'number') {
        return row[idx];
      }
    }
  }
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    for (const [key, idx] of headers.entries()) {
      if (key.includes(target)) {
        if (row[idx] !== undefined && row[idx] !== null) {
          const text = cellToString(row[idx]);
          if (text !== '' || typeof row[idx] === 'number') {
            return row[idx];
          }
        }
      }
    }
  }
  return undefined;
}

function toDateString(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateValue(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = excelSerialToDate(value);
    return date ? formatDateValue(date) : '';
  }
  const raw = cellToString(value);
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

function toInt(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n)) {
    throw new Error(`${field} 값이 올바르지 않습니다: ${String(value)}`);
  }
  return Math.trunc(n);
}

function toNumber(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const n = Number(String(value).replace(/,/g, '').replace(/원/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`시트 '${sheetName}'를 찾을 수 없습니다.`);
  }
  // Keep blank rows so fixed template layout stays aligned; Excel may still
  // omit trailing blanks, so header detection below is row-index resilient.
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: true,
  });
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((cell) => cellToString(cell) === '');
}

function rowHasHeaders(
  row: unknown[] | undefined,
  requiredAliases: string[][],
): boolean {
  if (!row?.length) {
    return false;
  }
  const headers = headerIndexMap(row);
  return requiredAliases.every((aliases) =>
    aliases.some((alias) => {
      const target = normalizeHeader(alias);
      if (headers.has(target)) {
        return true;
      }
      for (const key of headers.keys()) {
        if (key.includes(target) || target.includes(key)) {
          return true;
        }
      }
      return false;
    }),
  );
}

function findHeaderRowIndex(
  rows: unknown[][],
  requiredAliases: string[][],
  preferred1Based?: number,
): number {
  if (
    preferred1Based &&
    rowHasHeaders(rows[preferred1Based - 1], requiredAliases)
  ) {
    return preferred1Based - 1;
  }
  const limit = Math.min(rows.length, 20);
  for (let i = 0; i < limit; i += 1) {
    if (rowHasHeaders(rows[i], requiredAliases)) {
      return i;
    }
  }
  return -1;
}

export async function parseOrderBulkWorkbook(buffer: Buffer): Promise<{
  masters: ParsedMasterRow[];
  details: ParsedDetailRow[];
  greetings: ParsedGreetingRow[];
}> {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
  });

  const masterRows = sheetRows(workbook, MASTER_SHEET);
  const detailRows = sheetRows(workbook, DETAIL_SHEET);

  const masterHeaderIndex = findHeaderRowIndex(
    masterRows,
    [
      ['주문번호'],
      ['연락처', 'phone'],
      ['주문구분'],
      ['(주문자)성명', '주문자성명', '성명'],
    ],
    MASTER_HEADER_ROW,
  );
  const detailHeaderIndex = findHeaderRowIndex(
    detailRows,
    [
      ['주문번호'],
      ['주문제품명', '품명', '상품명'],
      ['주문수량', '수량'],
    ],
    DETAIL_HEADER_ROW,
  );

  if (masterHeaderIndex < 0 || detailHeaderIndex < 0) {
    throw new Error('헤더 행을 찾을 수 없습니다. 업로드 양식을 확인하세요.');
  }

  const masterHeader = masterRows[masterHeaderIndex] ?? [];
  const detailHeader = detailRows[detailHeaderIndex] ?? [];
  const masterHeaders = headerIndexMap(masterHeader);
  const detailHeaders = headerIndexMap(detailHeader);
  const masterDataStart = masterHeaderIndex + 1;
  const detailDataStart = detailHeaderIndex + 1;

  const masters: ParsedMasterRow[] = [];
  for (let i = masterDataStart; i < masterRows.length; i += 1) {
    const row = masterRows[i] ?? [];
    if (isBlankRow(row)) {
      continue;
    }

    const phone = cellToString(
      pickByHeader(row, masterHeaders, ['연락처', 'phone']),
    );
    const ordererName = cellToString(
      pickByHeader(row, masterHeaders, ['(주문자)성명', '주문자성명', '성명']),
    );
    const orderType = cellToString(
      pickByHeader(row, masterHeaders, ['주문구분']),
    );
    const orderDate = toDateString(
      pickByHeader(row, masterHeaders, ['주문일자']),
    );

    if (!phone && !ordererName && !orderType && !orderDate) {
      continue;
    }

    masters.push({
      orderNumber: cellToString(
        pickByHeader(row, masterHeaders, ['주문번호']),
      ),
      orderStatusLabel: cellToString(
        pickByHeader(row, masterHeaders, ['주문상태']),
      ),
      orderType,
      orderDate,
      branchStore: cellToString(
        pickByHeader(row, masterHeaders, ['소속/매장', '지부매장']),
      ),
      churchName: cellToString(pickByHeader(row, masterHeaders, ['중앙'])),
      ordererName,
      phone,
      parcelShipDate: toDateString(
        pickByHeader(row, masterHeaders, ['택배발송일']),
      ),
      deliveryDateTime: toDateString(
        pickByHeader(row, masterHeaders, ['배달일시', '배달일']),
      ),
      clientContactName: cellToString(
        pickByHeader(row, masterHeaders, ['거래처담당자']),
      ),
      clientContactPhone: cellToString(
        pickByHeader(row, masterHeaders, ['거래처담당자연락처']),
      ),
      senderName: cellToString(
        pickByHeader(row, masterHeaders, ['보내는사람']),
      ),
      senderPhone: cellToString(
        pickByHeader(row, masterHeaders, ['보내는연락처']),
      ),
      senderAddress: cellToString(
        pickByHeader(row, masterHeaders, ['보내는주소']),
      ),
      greetingNumber: cellToString(
        pickByHeader(row, masterHeaders, ['인사장번호']),
      ),
      businessCard: cellToString(
        pickByHeader(row, masterHeaders, ['은행명함유무', '명함유무']),
      ),
      greetingSelf: cellToString(
        pickByHeader(row, masterHeaders, [
          '은행자체인사장유무',
          '자체인사장유무',
        ]),
      ),
      specialNote: cellToString(
        pickByHeader(row, masterHeaders, ['특기사항', '특이사항']),
      ),
      manager: cellToString(pickByHeader(row, masterHeaders, ['담당자'])),
      remark: cellToString(pickByHeader(row, masterHeaders, ['비고'])),
      rowIndex: i + 1,
    });
  }

  const details: ParsedDetailRow[] = [];
  let lastDetailOrderNumber = '';
  for (let i = detailDataStart; i < detailRows.length; i += 1) {
    const row = detailRows[i] ?? [];
    if (isBlankRow(row)) {
      continue;
    }

    const productName = cellToString(
      pickByHeader(row, detailHeaders, ['주문제품명', '품명', '상품명']),
    );
    let orderNumber = cellToString(
      pickByHeader(row, detailHeaders, ['주문번호']),
    );
    if (!orderNumber && lastDetailOrderNumber) {
      orderNumber = lastDetailOrderNumber;
    }
    if (orderNumber) {
      lastDetailOrderNumber = orderNumber;
    }
    if (!productName && !orderNumber) {
      continue;
    }

    const qtyRaw = pickByHeader(row, detailHeaders, ['주문수량', '수량']);
    details.push({
      orderNumber,
      seq: toInt(
        pickByHeader(row, detailHeaders, ['순번']) ?? details.length + 1,
        '순번',
      ),
      shipType: cellToString(
        pickByHeader(row, detailHeaders, ['배달/택배', '주문구분']),
      ),
      productCode: cellToString(
        pickByHeader(row, detailHeaders, ['상품코드', '코드']),
      ),
      productName,
      quantity: Math.max(1, toInt(qtyRaw, '주문수량')),
      requestNote: cellToString(
        pickByHeader(row, detailHeaders, ['주문요청사항', '요청사항']),
      ),
      unitPrice: toNumber(
        pickByHeader(row, detailHeaders, ['단가(선택)', '단가']),
      ),
      shipStatus: cellToString(
        pickByHeader(row, detailHeaders, ['출고상태']),
      ),
      remark: cellToString(pickByHeader(row, detailHeaders, ['비고'])),
      rowIndex: i + 1,
    });
  }

  const greetings = parseGreetingSheet(workbook);

  try {
    const imagesByRow = await extractGreetingSheetImages(buffer);
    for (const greeting of greetings) {
      const hit = imagesByRow.get(greeting.rowIndex);
      if (hit) {
        greeting.imageBuffer = hit.buffer;
        greeting.imageExtension = hit.extension;
      }
    }
  } catch {
    // Text parse still works if image extraction fails
  }

  return { masters, details, greetings };
}

function parseGreetingSheet(workbook: XLSX.WorkBook): ParsedGreetingRow[] {
  if (!workbook.Sheets[GREETING_SHEET]) {
    return [];
  }
  const rows = sheetRows(workbook, GREETING_SHEET);
  const headerIndex = findHeaderRowIndex(rows, [
    ['주문번호'],
    ['인사장번호'],
    ['인사장내용', '내용'],
  ]);
  if (headerIndex < 0) {
    return [];
  }
  const headers = headerIndexMap(rows[headerIndex] ?? []);
  const greetings: ParsedGreetingRow[] = [];
  let lastOrderNumber = '';

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) {
      continue;
    }
    let orderNumber = cellToString(
      pickByHeader(row, headers, ['주문번호']),
    );
    if (!orderNumber && lastOrderNumber) {
      orderNumber = lastOrderNumber;
    }
    if (orderNumber) {
      lastOrderNumber = orderNumber;
    }

    const greetingNumberRaw = cellToString(
      pickByHeader(row, headers, ['인사장번호']),
    );
    const content = cellToString(
      pickByHeader(row, headers, ['인사장내용', '내용']),
    );
    if (!greetingNumberRaw && !content && !orderNumber) {
      continue;
    }

    const selfRaw = cellToString(
      pickByHeader(row, headers, ['자체', '자체인사장']),
    );
    const qtyRaw = pickByHeader(row, headers, ['수량', '인사장수량']);
    const size = cellToString(
      pickByHeader(row, headers, ['크기', '인사장크기']),
    );
    const businessCard = cellToString(
      pickByHeader(row, headers, ['명함동봉', '명함']),
    );

    greetings.push({
      orderNumber,
      greetingNumber: normalizeGreetingNumberToken(greetingNumberRaw),
      includeSelf:
        selfRaw === '유' ||
        selfRaw === '자체' ||
        selfRaw.toLowerCase() === 'y' ||
        selfRaw === 'true',
      content,
      quantity: Math.max(1, toInt(qtyRaw ?? 1, '인사장 수량')),
      size: size || '8칸',
      productName: cellToString(
        pickByHeader(row, headers, ['제품명', '주문제품명']),
      ),
      receivePlace: cellToString(
        pickByHeader(row, headers, ['받을곳', '인사장받을곳']),
      ),
      specialNote: cellToString(
        pickByHeader(row, headers, ['특이사항', '특기사항']),
      ),
      businessCard:
        businessCard === '유' || businessCard === '동봉'
          ? '동봉'
          : businessCard === '무' || businessCard === '미동봉'
            ? '미동봉'
            : businessCard || '미동봉',
      ordererName: cellToString(
        pickByHeader(row, headers, ['성명', '주문자', '(주문자)성명']),
      ),
      churchName: cellToString(pickByHeader(row, headers, ['중앙'])),
      phone: cellToString(pickByHeader(row, headers, ['연락처', 'phone'])),
      rowIndex: i + 1,
    });
  }

  return greetings;
}

/** Parse master 인사장번호 cell: blank | 1번 | 자체 | "1번, 자체" */
export function parseMasterGreetingField(value: string): {
  numbers: string[];
  includeSelf: boolean;
} {
  const raw = value.trim();
  if (!raw) {
    return { numbers: [], includeSelf: false };
  }
  const includeSelf = /자체/.test(raw);
  const numbers: string[] = [];
  const matches = raw.matchAll(/([1-4])\s*번?/g);
  for (const match of matches) {
    if (match[1] && !numbers.includes(match[1])) {
      numbers.push(match[1]);
    }
  }
  // bare 1-4 without 번
  if (numbers.length === 0 && /^[1-4]$/.test(raw.replace(/자체|,|\s/g, ''))) {
    const only = raw.replace(/자체|,|\s/g, '');
    if (/^[1-4]$/.test(only)) {
      numbers.push(only);
    }
  }
  return { numbers, includeSelf };
}

function normalizeGreetingNumberToken(value: string): string {
  const match = /([1-4])/.exec(value);
  return match?.[1] ?? value.replace(/번/g, '').trim();
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Sample / blank / temp link keys → server generates ORD-YYYY-XXXXXX. */
export function isPlaceholderOrderNumber(value: string): boolean {
  const v = value.trim();
  if (!v) {
    return true;
  }
  if (/^ORD-UPLOAD(?:-|$)/i.test(v)) {
    return true;
  }
  if (/^TEMP(?:-|_|\s)?/i.test(v)) {
    return true;
  }
  if (/^임시/.test(v)) {
    return true;
  }
  if (/^ORD-\d{4}-X+$/i.test(v)) {
    return true;
  }
  if (/X{4,}/i.test(v)) {
    return true;
  }
  return false;
}

export function generateOrderNumber(seed = Date.now()): string {
  const year = new Date().getFullYear();
  const suffix = String(seed).slice(-6).padStart(6, '0');
  return `ORD-${year}-${suffix}`;
}

export function mapStatusLabel(label: string): string | undefined {
  return resolveImportStatus(label)?.status;
}

export type ImportStatusResolution = {
  status:
    | 'PLACED'
    | 'WAITING_FOR_SHIPMENT'
    | 'PREPARED'
    | 'LOAD_NOTIFIED'
    | 'SHIPPING'
    | 'RECEIVED'
    | 'PRINTING_COMPLETE'
    | 'CANCELLED';
  shippedAt?: boolean;
  deliveredAt?: boolean;
};

/** Map Excel 주문상태 (배송상태 + 관리자배송관리 labels) to DB status / shipment flags. */
export function resolveImportStatus(
  label: string,
): ImportStatusResolution | undefined {
  const normalized = label.trim();
  const map: Record<string, ImportStatusResolution> = {
    // 배송상태 (멤버 관점)
    접수완료: { status: 'PLACED' },
    발송대기: { status: 'WAITING_FOR_SHIPMENT' },
    상품준비: { status: 'PREPARED' },
    발송중: { status: 'SHIPPING', shippedAt: true },
    상품수령: { status: 'RECEIVED' },
    // 관리자배송관리
    관리자승인: { status: 'WAITING_FOR_SHIPMENT' },
    배송상차알림: { status: 'LOAD_NOTIFIED' },
    배송완료: { status: 'RECEIVED', shippedAt: true, deliveredAt: true },
    출력완료: {
      status: 'PRINTING_COMPLETE',
      shippedAt: true,
      deliveredAt: true,
    },
    취소: { status: 'CANCELLED' },
    // codes
    PLACED: { status: 'PLACED' },
    WAITING_FOR_SHIPMENT: { status: 'WAITING_FOR_SHIPMENT' },
    PREPARED: { status: 'PREPARED' },
    LOAD_NOTIFIED: { status: 'LOAD_NOTIFIED' },
    SHIPPING: { status: 'SHIPPING', shippedAt: true },
    RECEIVED: { status: 'RECEIVED' },
    PRINTING_COMPLETE: {
      status: 'PRINTING_COMPLETE',
      shippedAt: true,
      deliveredAt: true,
    },
    CANCELLED: { status: 'CANCELLED' },
  };
  return map[normalized];
}

export function buildOrderNotes(
  master: ParsedMasterRow,
  items: ParsedDetailRow[],
): string {
  const orderType = master.orderType.trim() || '택배';
  const isDelivery = orderType.includes('배달');
  const isParcel = orderType.includes('택배') || !isDelivery;

  const parsedGreeting = parseMasterGreetingField(master.greetingNumber);
  const includeSelf =
    parsedGreeting.includeSelf ||
    master.greetingSelf === '유' ||
    master.greetingSelf.toLowerCase() === 'y' ||
    master.greetingSelf === '자체';
  const greetingNumber = parsedGreeting.numbers[0] ?? '';
  const businessCardYes =
    master.businessCard === '유' ||
    master.businessCard === '동봉' ||
    master.businessCard.toLowerCase() === 'y';

  const greetingKind = includeSelf
    ? '자체'
    : greetingNumber
      ? '본사'
      : '없음';

  const segments: Array<string | null> = [
    `주문자:${master.ordererName.trim()}`,
    `연락처:${master.phone.trim()}`,
    master.orderDate ? `주문일자:${master.orderDate.slice(0, 10)}` : null,
    master.churchName ? `중앙:${master.churchName.trim()}` : null,
    isDelivery && master.clientContactName
      ? `배달업체명:${master.clientContactName.trim()}`
      : null,
    isParcel && master.clientContactName && !isDelivery
      ? `택배업체명:${master.clientContactName.trim()}`
      : null,
    isDelivery && master.deliveryDateTime
      ? `배달일:${master.deliveryDateTime}`
      : null,
    isDelivery
      ? `받는분:${master.senderName.trim() || master.ordererName.trim()} / ${
          master.senderPhone.trim() || master.phone.trim()
        } / ${master.senderAddress.trim()}`
      : null,
    isParcel && master.parcelShipDate
      ? `택배발송일:${master.parcelShipDate.slice(0, 10)}`
      : null,
    isParcel
      ? `보내는사람:${master.senderName.trim() || master.ordererName.trim()} / ${
          master.senderPhone.trim() || master.phone.trim()
        } / ${master.senderAddress.trim()}`
      : null,
    master.branchStore ? `지부매장:${master.branchStore.trim()}` : null,
    `인사장종류:${greetingKind}`,
    greetingNumber ? `인사장번호:${greetingNumber}` : null,
    includeSelf ? '인사장자체:Y' : null,
    businessCardYes ? '명함동봉:Y' : null,
    master.specialNote
      ? `인사장특이사항:${master.specialNote.trim()}`
      : null,
    ...items.map((item) => {
      const kind =
        item.shipType.trim() ||
        (orderType === '배달/택배' ? '택배' : orderType) ||
        '택배';
      const label = kind.includes('배달') ? '배달' : '택배';
      return `[${label}] ${item.productName} ${item.quantity}개${
        item.requestNote ? `(${item.requestNote})` : ''
      }`;
    }),
  ];

  return segments.filter(Boolean).join(' / ');
}

export function estimatedWindowIso(
  master: ParsedMasterRow,
  isDelivery: boolean,
): string | undefined {
  if (isDelivery && master.deliveryDateTime) {
    const raw = master.deliveryDateTime.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return `${raw}T09:00:00.000Z`;
    }
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw)) {
      const [datePart, timePart] = raw.split(/\s+/);
      return `${datePart}T${timePart}:00.000Z`;
    }
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  if (!isDelivery && master.parcelShipDate) {
    const day = master.parcelShipDate.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return `${day}T09:00:00.000Z`;
    }
  }
  return undefined;
}
