import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { isMobileNumber, normalizePhone, splitAddress } from './partner-owner';

/** 거래처 일괄 등록 양식 (fe/public/templates/partner-bulk-upload.xlsx) */
export const PARTNER_IMPORT_HEADERS = [
  '거래처명',
  '구분',
  '구분2',
  '중앙',
  '담당자',
  '휴대폰',
  '유선전화',
  '주소',
  '거래처증거자료',
] as const;

type HeaderKey = (typeof PARTNER_IMPORT_HEADERS)[number];

/** 양식 머리글을 조금 다르게 적어도 알아본다 (공백·괄호 무시) */
const HEADER_ALIASES: Record<string, HeaderKey> = {
  거래처명: '거래처명',
  고객사명: '거래처명',
  거래처명고객사명: '거래처명',
  구분: '구분',
  구분1: '구분',
  구분2: '구분2',
  중앙: '중앙',
  담당자: '담당자',
  담당자명: '담당자',
  휴대폰: '휴대폰',
  휴대전화: '휴대폰',
  핸드폰: '휴대폰',
  유선전화: '유선전화',
  유선번호: '유선전화',
  전화번호: '유선전화',
  주소: '주소',
  거래처증거자료: '거래처증거자료',
  증거자료: '거래처증거자료',
};

export const MAX_PARTNER_IMPORT_ROWS = 3000;

export type ParsedPartnerRow = {
  /** 엑셀 행 번호 (1-based, 머리글 = 1) */
  rowNumber: number;
  name: string;
  category: string | null;
  subCategory: string | null;
  centerName: string | null;
  contactName: string;
  mobile: string | null;
  phone: string | null;
  address: string;
  addressDetail: string | null;
  errors: string[];
};

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((t) => t.text)
        .join('')
        .trim();
    }
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return String(value.text).trim();
    return '';
  }
  return String(value).trim();
}

function normalizeHeader(text: string): HeaderKey | undefined {
  return HEADER_ALIASES[text.replace(/[\s()（）]/g, '')];
}

/**
 * 첫 시트를 읽어 행 목록과 증거자료 열 번호를 돌려준다.
 * 휴대폰·유선전화 칸이 바뀌어 들어와도 번호 모양(01x)으로 맞는 칸에 넣는다.
 */
export async function parsePartnerSheet(buffer: Buffer): Promise<{
  rows: ParsedPartnerRow[];
  evidenceColumn: number;
}> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('엑셀(.xlsx) 파일을 읽지 못했습니다.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('시트를 찾을 수 없습니다.');

  const columns = new Map<HeaderKey, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const key = normalizeHeader(cellText(cell.value));
    if (key && !columns.has(key)) columns.set(key, col);
  });
  const required: HeaderKey[] = ['거래처명', '담당자', '주소'];
  const missing = required.filter((h) => !columns.has(h));
  if (missing.length) {
    throw new BadRequestException(
      `양식의 머리글이 없습니다: ${missing.join(', ')}. 일괄 등록 양식을 내려받아 사용해 주세요.`,
    );
  }

  const rows: ParsedPartnerRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const get = (key: HeaderKey) => {
      const col = columns.get(key);
      return col ? cellText(row.getCell(col).value) : '';
    };
    const values = PARTNER_IMPORT_HEADERS.filter(
      (h) => h !== '거래처증거자료',
    ).map(get);
    if (values.every((v) => !v)) continue;

    const errors: string[] = [];
    const name = get('거래처명');
    const contactName = get('담당자');
    const rawAddress = get('주소');
    if (!name) errors.push('거래처명이 없습니다.');
    if (!contactName) errors.push('담당자가 없습니다.');
    if (!rawAddress) errors.push('주소가 없습니다.');

    let mobile: string | null = null;
    let phone: string | null = null;
    for (const raw of [get('휴대폰'), get('유선전화')]) {
      const value = normalizePhone(raw.split(/[~/,]/)[0]);
      if (!value) continue;
      if (isMobileNumber(value)) {
        if (!mobile) mobile = value;
        else if (!phone) phone = value;
      } else if (!phone) {
        phone = value;
      } else if (!mobile) {
        mobile = value;
      }
    }
    // 휴대폰·유선전화가 모두 비면 새 거래처일 때만 오류 (기존 거래처 수정은 있던 번호를 둔다)

    const [address, addressDetail] = splitAddress(rawAddress);
    rows.push({
      rowNumber: r,
      name,
      category: get('구분') || null,
      subCategory: get('구분2') || null,
      centerName: get('중앙') || null,
      contactName,
      mobile,
      phone,
      address,
      addressDetail,
      errors,
    });
  }

  if (rows.length === 0) {
    throw new BadRequestException('등록할 거래처 행이 없습니다.');
  }
  if (rows.length > MAX_PARTNER_IMPORT_ROWS) {
    throw new BadRequestException(
      `한 번에 올릴 수 있는 행은 최대 ${MAX_PARTNER_IMPORT_ROWS}행입니다. (현재 ${rows.length}행)`,
    );
  }

  return {
    rows,
    evidenceColumn:
      columns.get('거래처증거자료') ?? PARTNER_IMPORT_HEADERS.length,
  };
}
