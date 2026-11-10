/**
 * 금융권 고객사 엑셀(시트 "고객사-최종") → Partner 테이블 일괄 입력.
 *
 * Usage (from be/):
 *   node scripts/import-partners-excel.mjs "<xlsx 경로>" [--dry-run]
 *
 * DATABASE_URL 환경변수(또는 .env)의 DB에 입력한다.
 * 같은 source 값으로 넣은 기존 행은 먼저 지우고 다시 넣으므로 여러 번 실행해도 중복되지 않는다.
 * 직접 등록한 거래처(source = 'MANUAL')는 건드리지 않는다.
 *
 * 매핑: 고객사명→name, 담당자→contactName, 유선번호→phone, 주소→address,
 *       구분→category, 구분2→subCategory, 중앙→centerName, 고객사ID→externalId,
 *       담당자에서 중앙을 뺀 이름→salesRepName (예: 수원이지원 - 수원 = 이지원)
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import pg from 'pg';

const SHEET_NAME = '고객사-최종';
const SOURCE = process.env.PARTNER_IMPORT_SOURCE ?? 'EXCEL_FINGER_202608';
const BATCH_SIZE = 1000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const filePath = args.find((a) => !a.startsWith('--'));

if (!filePath) {
  console.error('Usage: node scripts/import-partners-excel.mjs "<xlsx 경로>" [--dry-run]');
  process.exit(1);
}

function buildPoolConfig(connectionString) {
  if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString)) {
    return { connectionString };
  }
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return {
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
    };
  } catch {
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }
}

/** exceljs 셀 값 → 문자열 (rich text / 수식 결과 / 숫자 처리) */
function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join('').trim();
    }
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return String(value.text).trim();
    if (value instanceof Date) return value.toISOString();
  }
  return String(value).trim();
}

function salesRepFrom(manager, center) {
  if (!manager || !center || !manager.startsWith(center)) return null;
  const rest = manager.slice(center.length).replace(/^[\s\-]+/, '').trim();
  return rest || null;
}

async function readRows() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`시트 "${SHEET_NAME}"를 찾을 수 없습니다.`);

  const header = {};
  ws.getRow(1).eachCell((cell, col) => {
    header[cellText(cell.value)] = col;
  });
  const need = ['고객사ID', '구분', '고객사명', '구분2', '유선번호', '주소', '중앙', '담당자'];
  const missing = need.filter((h) => !header[h]);
  if (missing.length) throw new Error(`헤더 없음: ${missing.join(', ')}`);

  const rows = [];
  let skippedEmpty = 0;
  let skippedNoName = 0;
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const get = (h) => cellText(row.getCell(header[h]).value);
    const values = need.map(get);
    if (values.every((v) => !v)) {
      skippedEmpty += 1;
      continue;
    }
    const name = get('고객사명');
    if (!name) {
      skippedNoName += 1;
      continue;
    }
    const center = get('중앙') || null;
    const manager = get('담당자');
    rows.push({
      name,
      contactName: manager,
      phone: get('유선번호') || null,
      address: get('주소'),
      externalId: get('고객사ID') || null,
      category: get('구분') || null,
      subCategory: get('구분2') || null,
      centerName: center,
      salesRepName: salesRepFrom(manager, center),
    });
  }
  return { rows, skippedEmpty, skippedNoName };
}

const COLS = [
  'name',
  'contactName',
  'phone',
  'address',
  'externalId',
  'category',
  'subCategory',
  'centerName',
  'salesRepName',
];

async function main() {
  const { rows, skippedEmpty, skippedNoName } = await readRows();
  console.log(`source        : ${SOURCE}`);
  console.log(`입력 대상     : ${rows.length}`);
  console.log(`건너뜀(빈 행) : ${skippedEmpty}`);
  console.log(`건너뜀(이름無): ${skippedNoName}`);
  console.log(`연락처 없음   : ${rows.filter((r) => !r.phone).length}`);
  console.log(`담당자 없음   : ${rows.filter((r) => !r.contactName).length}`);
  console.log(`salesRepName  : ${rows.filter((r) => r.salesRepName).length}`);
  console.log('샘플:', rows.slice(0, 2));

  if (dryRun) {
    console.log('--dry-run: DB에 쓰지 않았습니다.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL이 없습니다.');
  const host = (() => {
    try {
      return new URL(connectionString).host;
    } catch {
      return '(unknown)';
    }
  })();
  console.log(`DB host       : ${host}`);

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM "Partner" WHERE "source" = $1', [SOURCE]);
    console.log(`기존 ${SOURCE} 삭제: ${del.rowCount}`);

    const insertCols = [...COLS, 'source', 'updatedAt'];
    const colSql = insertCols.map((c) => `"${c}"`).join(', ');
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const params = [];
      const tuples = batch.map((row) => {
        const ph = COLS.map((c) => {
          params.push(row[c]);
          return `$${params.length}`;
        });
        params.push(SOURCE);
        ph.push(`$${params.length}`);
        ph.push('NOW()');
        return `(${ph.join(', ')})`;
      });
      const res = await client.query(
        `INSERT INTO "Partner" (${colSql}) VALUES ${tuples.join(', ')}`,
        params,
      );
      inserted += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`입력 완료     : ${inserted}`);

    const { rows: counts } = await client.query(
      'SELECT "source", COUNT(*)::int AS n FROM "Partner" GROUP BY 1 ORDER BY 1',
    );
    console.log('Partner 건수  :', counts);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
