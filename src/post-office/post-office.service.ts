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

export type HolidayGiftConvertOptions = {
  boxUnit: number;
  paymentType: '선불' | '착불';
  productName: string;
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

    const boxUnit = Number(options.boxUnit);
    if (!Number.isFinite(boxUnit) || boxUnit <= 0) {
      throw new BadRequestException('박스단위는 1 이상의 숫자여야 합니다.');
    }

    if (options.paymentType !== '선불' && options.paymentType !== '착불') {
      throw new BadRequestException('선/착은 선불 또는 착불이어야 합니다.');
    }

    const productName = options.productName?.trim() ?? '';
    if (!productName) {
      throw new BadRequestException('상품명을 선택해 주세요.');
    }

    const centerName = await this.resolveCenterName(actor.id);
    const recipients = this.parseRecipients(file.buffer);

    if (recipients.length === 0) {
      throw new BadRequestException(
        '수취인 데이터가 없습니다. 명절선물_입력.xlsx 형식을 확인해 주세요.',
      );
    }

    const workbook = new Workbook();
    const templatePath = this.resolveTemplatePath();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('변환 템플릿을 불러오지 못했습니다.');
    }

    // Keep header row styles from the Korea Post sample template.
    // Remove any leftover prototype/data rows.
    if (worksheet.rowCount > 1) {
      worksheet.spliceRows(2, worksheet.rowCount - 1);
    }

    const total = recipients.length;
    const styleSource = this.createStylePrototype(worksheet);

    recipients.forEach((recipient, index) => {
      const excelRowNumber = index + 2;
      const values: Array<string | number | null> = [
        null,
        null,
        null,
        recipient.name,
        recipient.address,
        null,
        normalizeMobilePhone(recipient.phoneRaw),
        null,
        `${productName}(${total}-${index + 1})`,
        DELIVERY_MESSAGE,
        boxUnit,
        options.paymentType,
        null, // 금액 blank
        null,
        null,
        centerName,
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
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private resolveTemplatePath() {
    const candidates = [
      path.join(__dirname, '..', '..', 'templates', TEMPLATE_FILENAME),
      path.join(process.cwd(), 'templates', TEMPLATE_FILENAME),
      path.join(
        process.cwd(),
        'be',
        'templates',
        TEMPLATE_FILENAME,
      ),
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
    // Snapshot style from an empty data row so each generated row matches sample.
    const prototypeRow = worksheet.getRow(2);
    prototypeRow.height = DATA_ROW_HEIGHT;
    const styles: Array<ReturnType<typeof snapshotCellStyle>> = [];

    for (let column = 1; column <= COLUMN_COUNT; column += 1) {
      const cell = prototypeRow.getCell(column);
      // Default data look from the official sample: Arial 14, middle align.
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

  private async resolveCenterName(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullname: true,
        church: { select: { name: true } },
      },
    });

    if (!user) {
      throw new BadRequestException('로그인 사용자 정보를 찾을 수 없습니다.');
    }

    const churchName = user.church?.name?.trim() ?? '';
    const fullname = user.fullname?.trim() ?? '';

    if (!churchName) {
      throw new BadRequestException(
        '중앙&이름에 사용할 교회명이 없습니다. 회원 정보에 교회를 연결해 주세요.',
      );
    }
    if (!fullname) {
      throw new BadRequestException(
        '중앙&이름에 사용할 이름이 없습니다. 회원 정보를 확인해 주세요.',
      );
    }

    return `${churchName} ${fullname}`;
  }

  private parseRecipients(buffer: Buffer): RecipientRow[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException(
        '엑셀 파일을 읽지 못했습니다. .xlsx 형식인지 확인해 주세요.',
      );
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('엑셀 시트가 없습니다.');
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(
      sheet,
      {
        header: 1,
        defval: '',
        raw: false,
      },
    );

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

      if (name === '수취인명' || name === '이름') {
        continue;
      }

      if (!name || !address) {
        continue;
      }

      recipients.push({ name, phoneRaw, address });
    }

    return recipients;
  }
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

/** `10 3381 7789` / `01033817789` / `010-3381-7789` → `010-XXXX-XXXX` */
export function normalizeMobilePhone(raw: string): string {
  let digits = String(raw ?? '').replace(/\D/g, '');

  if (digits.length === 10 && digits.startsWith('10')) {
    digits = `0${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('01')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return String(raw ?? '').trim();
}
