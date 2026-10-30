import * as path from 'path';

/** 주문 첨부(대량 택배 명단)로 받는 파일: 사진 + PDF·엑셀 */
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.heic',
  '.heif',
  '.bmp',
]);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.csv']);

/**
 * 사진은 image/* + 사진 확장자(카메라 촬영본은 확장자가 없을 수 있음),
 * 문서는 확장자로만 판단한다 (모바일은 엑셀을 application/octet-stream 으로 보내기도 한다).
 * 목록 밖 확장자(.html, .svg 등)는 public 에 저장되면 안 되므로 막는다.
 */
export function isAllowedOrderAttachment(file: {
  originalname?: string;
  mimetype?: string;
}) {
  const ext = path.extname(file.originalname ?? '').toLowerCase();
  if (DOCUMENT_EXTENSIONS.has(ext)) return true;
  if (!file.mimetype?.startsWith('image/')) return false;
  return ext === '' || IMAGE_EXTENSIONS.has(ext);
}
