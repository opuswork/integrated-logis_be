import { createHash } from 'crypto';

import { extractSheetImages } from '../common/excel-sheet-images.js';

/**
 * 재고 엑셀업로드 양식의 '사진' 칸에 넣은 이미지를 행 단위로 꺼낸다.
 *
 * 추출 자체는 common/excel-sheet-images 를 쓴다 (인사장 업로드와 같은 로직).
 * 여기서는 재고 쪽에 필요한 sha256/mimetype 만 덧붙인다. 해시가 있어야
 * '사진이 바뀐 경우에만' 교체할 수 있다.
 */
export type ExtractedImage = {
  buffer: Buffer;
  extension: string;
  mimetype: string;
  /** 같은 사진인지 판별해 재업로드를 건너뛰기 위한 값 */
  sha256: string;
  /** 저장 파일명에 쓸 이름 (원본 파일명은 엑셀에 남지 않는다) */
  originalName: string;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  tiff: 'image/tiff',
};

export function mimeForExtension(extension: string) {
  return (
    MIME_BY_EXTENSION[extension.replace(/^\./, '').toLowerCase()] ??
    'application/octet-stream'
  );
}

export function hashImage(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 엑셀 행 번호(1-based) → 그 행의 사진.
 *
 * `photoColumn` 은 1-based 열 번호. 한 행에 이미지가 여러 개면 이 열에 가까운 것을 고른다.
 * 파싱에 실패해도 업로드 전체를 막지 않도록 빈 Map 을 돌려준다.
 */
export async function extractStockRowImages(
  buffer: Buffer,
  photoColumn: number,
): Promise<Map<number, ExtractedImage>> {
  let raw: Map<number, { buffer: Buffer; extension: string }>;
  try {
    raw = await extractSheetImages(buffer, { preferredColumn: photoColumn });
  } catch {
    // 사진을 못 읽는다고 재고 업로드까지 실패시키지는 않는다
    return new Map();
  }

  const byRow = new Map<number, ExtractedImage>();
  for (const [rowNumber, image] of raw) {
    if (!image.buffer?.length) continue;
    const extension = (image.extension || 'png')
      .replace(/^\./, '')
      .toLowerCase();
    byRow.set(rowNumber, {
      buffer: image.buffer,
      extension,
      mimetype: mimeForExtension(extension),
      sha256: hashImage(image.buffer),
      originalName: `excel-row${rowNumber}.${extension}`,
    });
  }

  return byRow;
}
