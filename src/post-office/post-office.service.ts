import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Workbook, type Worksheet, type Cell } from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

import type { AuthUserPayload } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

const DELIVERY_MESSAGE = '파손주의 / 배송전 연락바랍니다.';
const OUTPUT_FILENAME = '우체국택배_업로드_컨버트.xlsx';
const TEMPLATE_FILENAME = '우체국택배_업로드_컨버트_template.xlsx';
const DATA_ROW_HEIGHT = 29.45;
const COLUMN_COUNT = 18;

export type HolidayGiftConvertOption = {
  productLabel: string;
  quantity: number;
  paymentType: '선불' | '착불';
  boxUnit: number;
};

export type HolidayGiftConvertOptions = {
  ordererName: string;
  churchName: string;
  options: HolidayGiftConvertOption[];
};

type RecipientRow = {
  name: string;
  phoneRaw: string;
  address: string;
};

@Injectable()
export class PostOfficeService {
  constructor(private readonly prisma: PrismaService) {}

  getOutputFilename() {
    return OUTPUT_FILENAME;
  }

  async convertHolidayGiftList(
    file: Express.Multer.File | undefined,
    options: HolidayGiftConvertOptions,
    actor: AuthUserPayload,
  ): Promise<Buffer> {
    if (actor.role !== 'admin') {
      throw new ForbiddenException(
        '관리자만 우체국택배 업로드 변환을 사용할 수 있습니다.',
      );
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('엑셀 파일을 업로드해 주세요.');
    }

    const ordererName = options.ordererName?.trim() ?? '';
    const churchName = options.churchName?.trim() ?? '';
    if (!churchName) {
      throw new BadRequestException('중앙을 입력해 주세요.');
    }
    if (!ordererName) {
      throw new BadRequestException('주문자 성명을 입력해 주세요.');
    }

    const convertOptions = (options.options ?? []).filter(
      (o) => o.productLabel?.trim(),
    );
    if (convertOptions.length === 0) {
      throw new BadRequestException('상품 옵션을 1개 이상 입력해 주세요.');
    }

    for (const opt of convertOptions) {
      const boxUnit = Number(opt.boxUnit);
      if (!Number.isFinite(boxUnit) || boxUnit <= 0) {
        throw new BadRequestException(
          '박스단위는 1 이상의 숫자여야 합니다.',
        );
      }
      if (opt.paymentType !== '선불' && opt.paymentType !== '착불') {
        throw new BadRequestException('선/착은 선불 또는 착불이어야 합니다.');
      }
      const qty = Number(opt.quantity);
      if (!Number.isFinite(qty) || qty < 1) {
        throw new BadRequestException('수량은 1 이상이어야 합니다.');
      }
    }

    const grandTotal = convertOptions.reduce(
      (sum, opt) => sum + Math.trunc(Number(opt.quantity)),
      0,
    );
    const centerAndName = `${churchName} ${ordererName}`;
    const recipients = this.parseRecipients(file.buffer);

    if (recipients.length === 0) {
      throw new BadRequestException(
        '수취인 데이터가 없습니다. 명절선물_입력.xlsx 형식을 확인해 주세요.',
      );
    }
    if (recipients.length < grandTotal) {
      throw new BadRequestException(
        `수취인이 ${grandTotal}명 필요합니다. (현재 ${recipients.length}명)`,
      );
    }

    const workbook = new Workbook();
    const templatePath = this.resolveTemplatePath();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('변환 템플릿을 불러오지 못했습니다.');
    }

    if (worksheet.rowCount > 1) {
      worksheet.spliceRows(2, worksheet.rowCount - 1);
    }

    const styleSource = this.createStylePrototype(worksheet);
    let excelRowNumber = 2;
    let recipientCursor = 0;

    for (const opt of convertOptions) {
      const qty = Math.trunc(Number(opt.quantity));
      const boxUnit = Number(opt.boxUnit);
      const shortName = toPostOfficeProductName(opt.productLabel);

      for (let i = 1; i <= qty; i += 1) {
        const recipient = recipients[recipientCursor];
        recipientCursor += 1;
        const values: Array<string | number | null> = [
          null, // 주문자명 공란
          null,
          null,
          recipient.name,
          recipient.address,
          null,
          normalizeMobilePhone(recipient.phoneRaw),
          null,
          `매장)${shortName}(${grandTotal}-${i})`,
          DELIVERY_MESSAGE,
          boxUnit,
          opt.paymentType,
          null,
          null,
          null,
          centerAndName,
          null,
          null,
        ];

        const row = worksheet.getRow(excelRowNumber);
        row.height = DATA_ROW_HEIGHT;
        values.forEach((value, columnIndex) => {
          const cell = row.getCell(columnIndex + 1);
          this.applyDataCellStyle(cell, styleSource[columnIndex]);
          cell.value = value;
        });
        row.commit();
        excelRowNumber += 1;
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private resolveTemplatePath() {
    const candidates = [
      path.join(__dirname, '..', '..', 'templates', TEMPLATE_FILENAME),
      path.join(process.cwd(), 'templates', TEMPLATE_FILENAME),
      path.join(process.cwd(), 'be', 'templates', TEMPLATE_FILENAME),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new BadRequestException(
      '우체국택배 업로드 템플릿 파일이 없습니다. be/templates 경로를 확인해 주세요.',
    );
  }

  private createStylePrototype(worksheet: Worksheet) {
    const prototypeRow = worksheet.getRow(2);
    prototypeRow.height = DATA_ROW_HEIGHT;
    const styles: Array<ReturnType<typeof snapshotCellStyle>> = [];

    for (let column = 1; column <= COLUMN_COUNT; column += 1) {
      const cell = prototypeRow.getCell(column);
      if (!cell.font?.name) {
        cell.font = { name: 'Arial', size: 14, family: 2 };
      }
      if (!cell.alignment) {
        cell.alignment = { vertical: 'middle' };
      }
      styles.push(snapshotCellStyle(cell));
    }

    return styles;
  }

  private applyDataCellStyle(
    cell: Cell,
    style: ReturnType<typeof snapshotCellStyle>,
  ) {
    if (style.font) {
      cell.font = { ...style.font };
    }
    if (style.alignment) {
      cell.alignment = { ...style.alignment };
    }
    if (style.border) {
      cell.border = { ...style.border };
    }
    if (style.fill) {
      cell.fill = { ...style.fill };
    }
    if (style.numFmt) {
      cell.numFmt = style.numFmt;
    }
  }

  private parseRecipients(buffer: Buffer): RecipientRow[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('엑셀 파일을 읽을 수 없습니다.');
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('시트가 없습니다.');
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    const recipients: RecipientRow[] = [];

    for (const row of rows) {
      if (!Array.isArray(row)) {
        continue;
      }
      const name = String(row[1] ?? '').trim();
      const phoneRaw = String(row[2] ?? '').trim();
      const address = String(row[3] ?? '').trim();

      if (!name && !phoneRaw && !address) {
        continue;
      }
      if (
        name === '수취인명' ||
        name === '이름' ||
        name.includes('수취인')
      ) {
        continue;
      }
      if (!name) {
        continue;
      }

      recipients.push({ name, phoneRaw, address });
    }

    return recipients;
  }
}

/** Strip box brackets / 매장) prefix for excel product cell. */
function toPostOfficeProductName(label: string): string {
  return label
    .trim()
    .replace(/^매장\)\s*/u, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMobilePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('010')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw.trim();
}

function snapshotCellStyle(cell: Cell) {
  return {
    font: cell.font ? { ...cell.font } : undefined,
    alignment: cell.alignment ? { ...cell.alignment } : undefined,
    border: cell.border ? { ...cell.border } : undefined,
    fill: cell.fill ? { ...cell.fill } : undefined,
    numFmt: cell.numFmt,
  };
}
