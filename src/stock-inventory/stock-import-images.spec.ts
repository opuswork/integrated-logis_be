import { createHash } from 'crypto';
import ExcelJS from 'exceljs';

import {
  extractStockRowImages,
  hashImage,
  mimeForExtension,
} from './stock-import-images';

/** 1x1 PNG */
const PNG_A = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
/** 다른 1x1 PNG (색이 다름) */
const PNG_B = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const HEADER = ['코드', '사진', '품명', '단위', '구분'];
const PHOTO_COLUMN = 2; // 1-based: 코드(1), 사진(2)

/** 지정한 (엑셀행, 엑셀열)에 앵커 이미지를 넣은 xlsx 버퍼를 만든다. */
async function buildWorkbook(
  images: Array<{ row: number; col: number; buffer: Buffer }>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('재고업로드');
  ws.addRow(HEADER);
  ws.addRow(['A-001', '', '감사1호', 1, '선물세트']);
  ws.addRow(['A-002', '', '기쁨1호', 1, '선물세트']);
  ws.addRow(['A-003', '', '특선1호', 1, '선물세트']);

  for (const item of images) {
    const id = wb.addImage({
      buffer: item.buffer as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
    // addImage 앵커는 0-based
    ws.addImage(id, {
      tl: { col: item.col - 1, row: item.row - 1 },
      br: { col: item.col, row: item.row },
    } as unknown as Parameters<typeof ws.addImage>[1]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('extractStockRowImages (엑셀 셀 안 사진 추출)', () => {
  it('사진 열에 앵커된 이미지를 행 번호로 꺼낸다', async () => {
    const buffer = await buildWorkbook([
      { row: 2, col: PHOTO_COLUMN, buffer: PNG_A },
      { row: 4, col: PHOTO_COLUMN, buffer: PNG_B },
    ]);

    const byRow = await extractStockRowImages(buffer, PHOTO_COLUMN);

    expect([...byRow.keys()].sort()).toEqual([2, 4]);
    expect(byRow.get(2)!.buffer.equals(PNG_A)).toBe(true);
    expect(byRow.get(4)!.buffer.equals(PNG_B)).toBe(true);
    // 3행에는 사진을 넣지 않았다
    expect(byRow.has(3)).toBe(false);
  });

  it('추출한 이미지의 sha256 이 원본과 같다 (변경 감지의 근거)', async () => {
    const buffer = await buildWorkbook([
      { row: 2, col: PHOTO_COLUMN, buffer: PNG_A },
    ]);

    const image = (await extractStockRowImages(buffer, PHOTO_COLUMN)).get(2)!;

    expect(image.sha256).toBe(createHash('sha256').update(PNG_A).digest('hex'));
    expect(image.sha256).not.toBe(hashImage(PNG_B));
    expect(image.mimetype).toBe('image/png');
    expect(image.extension).toBe('png');
  });

  it('사진이 하나도 없으면 빈 Map 을 돌려준다', async () => {
    const buffer = await buildWorkbook([]);
    await expect(
      extractStockRowImages(buffer, PHOTO_COLUMN),
    ).resolves.toHaveProperty('size', 0);
  });

  it('엑셀이 아닌 파일이어도 던지지 않고 빈 Map 을 돌려준다', async () => {
    const byRow = await extractStockRowImages(
      Buffer.from('이건 엑셀이 아님'),
      PHOTO_COLUMN,
    );
    expect(byRow.size).toBe(0);
  });

  it('같은 행에 이미지가 여러 개면 사진 열에 가까운 것을 고른다', async () => {
    // 2행에 사진열(2)과 멀리 떨어진 열(5)에 각각 이미지
    const buffer = await buildWorkbook([
      { row: 2, col: 5, buffer: PNG_B },
      { row: 2, col: PHOTO_COLUMN, buffer: PNG_A },
    ]);

    const image = (await extractStockRowImages(buffer, PHOTO_COLUMN)).get(2)!;
    expect(image.buffer.equals(PNG_A)).toBe(true);
  });
});

describe('mimeForExtension', () => {
  it('확장자를 MIME 으로 바꾼다', () => {
    expect(mimeForExtension('png')).toBe('image/png');
    expect(mimeForExtension('.JPG')).toBe('image/jpeg');
    expect(mimeForExtension('jpeg')).toBe('image/jpeg');
    expect(mimeForExtension('xyz')).toBe('application/octet-stream');
  });
});
