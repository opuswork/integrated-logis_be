import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const GREETING_SHEET = '08_인사장_데이터';

export type ExcelGreetingImage = {
  buffer: Buffer;
  extension: string;
  rowNumber: number; // 1-based sheet row
  colNumber: number; // 1-based
};

/**
 * Extract greeting images from the 08 sheet.
 * Supports:
 * 1) Classic floating pictures (Insert → Pictures) via ExcelJS
 * 2) Excel 365 "Picture in Cell" (paste/place in cell) via richData + xl/media
 */
export async function extractGreetingSheetImages(
  buffer: Buffer,
): Promise<Map<number, ExcelGreetingImage>> {
  const byRow = new Map<number, ExcelGreetingImage>();

  await extractFloatingImages(buffer, byRow);
  if (byRow.size === 0) {
    await extractInCellRichImages(buffer, byRow);
  }

  return byRow;
}

async function extractFloatingImages(
  buffer: Buffer,
  byRow: Map<number, ExcelGreetingImage>,
) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet(GREETING_SHEET);
  if (!sheet?.getImages) {
    return;
  }

  for (const meta of sheet.getImages()) {
    const imageId = Number(meta.imageId);
    const image = workbook.getImage(imageId);
    if (!image?.buffer) {
      continue;
    }

    const tl = meta.range?.tl as
      | { nativeRow?: number; nativeCol?: number; row?: number; col?: number }
      | undefined;
    const nativeRow =
      typeof tl?.nativeRow === 'number'
        ? tl.nativeRow
        : typeof tl?.row === 'number'
          ? Math.floor(tl.row)
          : undefined;
    const nativeCol =
      typeof tl?.nativeCol === 'number'
        ? tl.nativeCol
        : typeof tl?.col === 'number'
          ? Math.floor(tl.col)
          : undefined;

    if (nativeRow === undefined) {
      continue;
    }

    const rowNumber = nativeRow + 1;
    const colNumber = (nativeCol ?? 2) + 1;
    const extension = (image.extension || 'jpeg').replace(/^\./, '');
    const buf = Buffer.isBuffer(image.buffer)
      ? image.buffer
      : Buffer.from(image.buffer as ArrayBuffer);

    putPreferringImageColumn(byRow, {
      buffer: buf,
      extension,
      rowNumber,
      colNumber,
    });
  }
}

/**
 * Excel 365 in-cell pictures are stored as richData (_localImage), not drawings.
 * Cell C has vm="N" → metadata → richValue → richValueRel → xl/media/imageN.ext
 */
async function extractInCellRichImages(
  buffer: Buffer,
  byRow: Map<number, ExcelGreetingImage>,
) {
  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = await findGreetingSheetPath(zip);
  if (!sheetPath) {
    return;
  }

  const sheetXml = await zip.file(sheetPath)?.async('string');
  if (!sheetXml) {
    return;
  }

  const mediaByRichIndex = await mapRichValueImages(zip);
  if (mediaByRichIndex.size === 0) {
    // Fallback: single media file → first data row with 인사장번호
    const mediaFiles = Object.keys(zip.files).filter((n) =>
      /^xl\/media\/image\d+\./i.test(n),
    );
    if (mediaFiles.length === 1) {
      const mediaPath = mediaFiles[0];
      const ext = mediaPath.split('.').pop() || 'png';
      const imgBuf = await zip.file(mediaPath)!.async('nodebuffer');
      const rowMatch = sheetXml.match(
        /<c r="[A-Z]+(\d+)"[^>]*vm="/,
      );
      const rowNumber = rowMatch ? Number(rowMatch[1]) : 4;
      putPreferringImageColumn(byRow, {
        buffer: imgBuf,
        extension: ext,
        rowNumber,
        colNumber: 3,
      });
    }
    return;
  }

  // valueMetadata index (1-based vm) → rich value index
  const vmToRichIndex = await parseValueMetadataToRichIndex(zip);

  // Cells with vm attribute: <c r="C4" ... vm="1">
  const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(sheetXml)) !== null) {
    const colLetters = match[1];
    const rowNumber = Number(match[2]);
    const attrs = match[3] ?? '';
    const vmMatch = /\bvm="(\d+)"/.exec(attrs);
    if (!vmMatch) {
      continue;
    }
    const vm = Number(vmMatch[1]); // 1-based
    const richIndex = vmToRichIndex.get(vm);
    if (richIndex === undefined) {
      continue;
    }
    const media = mediaByRichIndex.get(richIndex);
    if (!media) {
      continue;
    }
    putPreferringImageColumn(byRow, {
      buffer: media.buffer,
      extension: media.extension,
      rowNumber,
      colNumber: colLettersToNumber(colLetters),
    });
  }
}

async function findGreetingSheetPath(zip: JSZip): Promise<string | null> {
  const wbXml = await zip.file('xl/workbook.xml')?.async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!wbXml || !relsXml) {
    return null;
  }

  const sheetTagRe =
    /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g;
  let sheetMatch: RegExpExecArray | null;
  let rId: string | null = null;
  while ((sheetMatch = sheetTagRe.exec(wbXml)) !== null) {
    if (sheetMatch[1] === GREETING_SHEET) {
      rId = sheetMatch[2];
      break;
    }
  }
  if (!rId) {
    return null;
  }

  const relRe = new RegExp(
    `<Relationship[^>]*Id="${rId}"[^>]*Target="([^"]+)"[^>]*/>`,
  );
  const relMatch = relRe.exec(relsXml);
  if (!relMatch) {
    return null;
  }
  const target = relMatch[1].replace(/^\//, '');
  return target.startsWith('xl/') ? target : `xl/${target}`;
}

async function parseValueMetadataToRichIndex(
  zip: JSZip,
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const metaXml = await zip.file('xl/metadata.xml')?.async('string');
  if (!metaXml) {
    return map;
  }

  // Collect futureMetadata XLRICHVALUE rvb i values in order
  const richIndexes: number[] = [];
  const fmRe =
    /<futureMetadata[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/;
  const fm = fmRe.exec(metaXml)?.[1] ?? '';
  const rvbRe = /<xlrd:rvb[^>]*\bi="(\d+)"/g;
  let rvb: RegExpExecArray | null;
  while ((rvb = rvbRe.exec(fm)) !== null) {
    richIndexes.push(Number(rvb[1]));
  }

  // valueMetadata blocks in order; vm attribute is 1-based index
  const vmSection =
    /<valueMetadata[^>]*>([\s\S]*?)<\/valueMetadata>/.exec(metaXml)?.[1] ??
    '';
  const bkRe = /<bk>([\s\S]*?)<\/bk>/g;
  let bk: RegExpExecArray | null;
  let vmIndex = 1;
  while ((bk = bkRe.exec(vmSection)) !== null) {
    const vMatch = /<rc[^>]*\bv="(\d+)"/.exec(bk[1]);
    if (vMatch) {
      const futureIdx = Number(vMatch[1]);
      const richIndex = richIndexes[futureIdx];
      if (richIndex !== undefined) {
        map.set(vmIndex, richIndex);
      }
    }
    vmIndex += 1;
  }

  // Fallback: vm=1 → rich 0 when only one image
  if (map.size === 0 && richIndexes.length > 0) {
    map.set(1, richIndexes[0]);
  }

  return map;
}

async function mapRichValueImages(
  zip: JSZip,
): Promise<Map<number, { buffer: Buffer; extension: string }>> {
  const result = new Map<number, { buffer: Buffer; extension: string }>();

  const structureXml = await zip
    .file('xl/richData/rdrichvaluestructure.xml')
    ?.async('string');
  const dataXml = await zip.file('xl/richData/rdrichvalue.xml')?.async('string');
  const relXml = await zip.file('xl/richData/richValueRel.xml')?.async('string');
  const relsXml = await zip
    .file('xl/richData/_rels/richValueRel.xml.rels')
    ?.async('string');

  if (!structureXml || !dataXml || !relXml || !relsXml) {
    return result;
  }

  // Only handle _localImage structures; find LocalImageIdentifier value index
  const structMatch =
    /<s t="_localImage">([\s\S]*?)<\/s>/.exec(structureXml) ??
    /<s[^>]*t="_localImage"[^>]*>([\s\S]*?)<\/s>/.exec(structureXml);
  if (!structMatch) {
    return result;
  }
  const keys = [...structMatch[1].matchAll(/<k[^>]*\bn="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const localImageKeyIndex = keys.findIndex((k) =>
    k.includes('LocalImageIdentifier'),
  );
  if (localImageKeyIndex < 0) {
    return result;
  }

  // rId → media path
  const rIdToTarget = new Map<string, string>();
  const relItemRe =
    /<Relationship([^>]*)\/>/g;
  let relItem: RegExpExecArray | null;
  while ((relItem = relItemRe.exec(relsXml)) !== null) {
    const attrs = relItem[1];
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) {
      const normalized = target.replace(/^\.\.\//, 'xl/');
      rIdToTarget.set(id, normalized);
    }
  }

  // richValueRel order: index i → r:id
  const relIds: string[] = [];
  const relRe = /<rel[^>]*r:id="([^"]+)"/g;
  let rel: RegExpExecArray | null;
  while ((rel = relRe.exec(relXml)) !== null) {
    relIds.push(rel[1]);
  }

  // Each <rv> is one rich value; LocalImageIdentifier points into relIds
  const rvRe = /<rv[^>]*>([\s\S]*?)<\/rv>/g;
  let rv: RegExpExecArray | null;
  let richIndex = 0;
  while ((rv = rvRe.exec(dataXml)) !== null) {
    const values = [...rv[1].matchAll(/<v>([^<]*)<\/v>/g)].map((m) => m[1]);
    const localIdRaw = values[localImageKeyIndex];
    const localId = Number(localIdRaw);
    if (!Number.isFinite(localId)) {
      richIndex += 1;
      continue;
    }
    const rId = relIds[localId];
    const mediaPath = rId ? rIdToTarget.get(rId) : undefined;
    if (mediaPath && zip.file(mediaPath)) {
      const imgBuf = await zip.file(mediaPath)!.async('nodebuffer');
      const extension = mediaPath.split('.').pop() || 'png';
      result.set(richIndex, { buffer: imgBuf, extension });
    }
    richIndex += 1;
  }

  return result;
}

function colLettersToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function putPreferringImageColumn(
  byRow: Map<number, ExcelGreetingImage>,
  image: ExcelGreetingImage,
) {
  const existing = byRow.get(image.rowNumber);
  if (
    !existing ||
    Math.abs(image.colNumber - 3) < Math.abs(existing.colNumber - 3)
  ) {
    byRow.set(image.rowNumber, image);
  }
}
