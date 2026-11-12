/**
 * 담당자 한 명의 거래처 엑셀(지점명·주소·연락처) → Partner 테이블 입력.
 * 예: IFC오수영거래처.xlsx → 담당자 오수영
 *
 * Usage (from be/):
 *   node scripts/import-partners-owner-excel.mjs "<xlsx 경로>" --owner 오수영 --source EXCEL_IFC_OSY_202611 [--dry-run]
 *
 * DATABASE_URL 환경변수(또는 .env)의 DB에 입력한다.
 * 같은 source 값으로 넣은 행만 지우고 다시 넣는다. 다른 거래처는 건드리지 않고, 여러 번 실행해도 중복되지 않는다.
 * 삭제와 입력은 한 트랜잭션이다.
 *
 * 매핑: 지점명→name, 주소→address/addressDetail, 연락처→phone(휴대폰도 저장),
 *       --owner→contactName·salesRepName
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import pg from 'pg';

import {
  backfillPartnerOwners,
  buildPoolConfig,
  cellText,
  dbHost,
  formatPhoneDigits,
  phoneDigits,
  splitAddress,
} from './partner-import-utils.mjs';

const args = process.argv.slice(2);
const optionValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes('--dry-run');
const owner = optionValue('--owner')?.trim();
const source = optionValue('--source')?.trim();
const optionValues = new Set([owner, source]);
const filePath = args.find((a) => !a.startsWith('--') && !optionValues.has(a));

if (!filePath || !owner || !source) {
  console.error(
    'Usage: node scripts/import-partners-owner-excel.mjs "<xlsx 경로>" --owner <담당자> --source <SOURCE> [--dry-run]',
  );
  process.exit(1);
}
if (source === 'MANUAL' || source.startsWith('EXCEL_FINAL')) {
  console.error(`source "${source}" 는 다른 데이터와 겹쳐 쓸 수 없습니다.`);
  process.exit(1);
}

/** 연락처: 하이픈 형식만 맞추고 휴대폰도 그대로 둔다 */
function normalizeContact(raw) {
  const first = raw.trim().split(/[~/,]/)[0].trim();
  if (!first) return null;
  return formatPhoneDigits(phoneDigits(first)) ?? first.replace(/[.\s]+/g, '-');
}

async function readRows() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('시트가 없습니다.');

  const header = {};
  ws.getRow(1).eachCell((cell, col) => {
    header[cellText(cell.value)] = col;
  });
  const need = ['지점명', '주소', '연락처'];
  const missing = need.filter((h) => !header[h]);
  if (missing.length) throw new Error(`헤더 없음: ${missing.join(', ')}`);

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const get = (h) => cellText(row.getCell(header[h]).value);
    const name = get('지점명');
    if (!name) continue;
    const [address, addressDetail] = splitAddress(get('주소'));
    rows.push({
      name,
      contactName: owner,
      salesRepName: owner,
      phone: normalizeContact(get('연락처')),
      address,
      addressDetail,
    });
  }
  return { sheetName: ws.name, rows };
}

const COLS = ['name', 'contactName', 'salesRepName', 'phone', 'address', 'addressDetail'];

async function main() {
  const { sheetName, rows } = await readRows();
  console.log(`시트          : ${sheetName}`);
  console.log(`담당자        : ${owner}`);
  console.log(`source        : ${source}`);
  console.log(`입력 대상     : ${rows.length}`);
  console.log(`상세주소 분리 : ${rows.filter((r) => r.addressDetail).length}`);
  console.log(`연락처 없음   : ${rows.filter((r) => !r.phone).length}`);
  console.log('샘플:', rows.slice(0, 2));

  if (dryRun) {
    console.log('--dry-run: DB에 쓰지 않았습니다.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL이 없습니다.');
  console.log(`DB host       : ${dbHost(connectionString)}`);

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM "Partner" WHERE "source" = $1', [source]);
    console.log(`기존 ${source} 삭제: ${del.rowCount}`);

    const insertCols = [...COLS, 'source', 'updatedAt'];
    const params = [];
    const tuples = rows.map((row) => {
      const ph = COLS.map((c) => {
        params.push(row[c]);
        return `$${params.length}`;
      });
      params.push(source);
      ph.push(`$${params.length}`, 'NOW()');
      return `(${ph.join(', ')})`;
    });
    const res = await client.query(
      `INSERT INTO "Partner" (${insertCols.map((c) => `"${c}"`).join(', ')}) VALUES ${tuples.join(', ')}`,
      params,
    );
    // 개인앱 고객사 검색용 소유자 칸 (사람 담당자 / 지역)
    const owners = await backfillPartnerOwners(client, {
      whereSql: '"source" = $1',
      params: [source],
    });
    console.log(`소유자 판정   : 사람 ${owners.person}건(${owners.people}명) / 지역 ${owners.region}건 / 없음 ${owners.none}건`);
    await client.query('COMMIT');
    console.log(`입력 완료     : ${res.rowCount}`);

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
