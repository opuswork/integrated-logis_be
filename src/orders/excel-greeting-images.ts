import {
  extractSheetImages,
  type ExcelSheetImage,
} from '../common/excel-sheet-images.js';

const GREETING_SHEET = '08_인사장_데이터';
/** 인사장 시트에서 이미지가 들어가는 열 (C열) */
const GREETING_IMAGE_COLUMN = 3;

export type ExcelGreetingImage = ExcelSheetImage;

/**
 * 인사장(08) 시트의 이미지를 행 단위로 꺼낸다.
 *
 * 실제 추출은 common/excel-sheet-images 에서 하고, 여기서는 인사장 시트에 맞는
 * 설정만 준다. 재고 엑셀업로드도 같은 로직을 쓴다.
 */
export function extractGreetingSheetImages(
  buffer: Buffer,
): Promise<Map<number, ExcelGreetingImage>> {
  return extractSheetImages(buffer, {
    sheetName: GREETING_SHEET,
    preferredColumn: GREETING_IMAGE_COLUMN,
  });
}
