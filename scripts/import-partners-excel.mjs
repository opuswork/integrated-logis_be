/**
 * 금융권 고객사 엑셀(시트 "고객사-최종") → Partner 테이블 일괄 입력.
 *
 * Usage (from be/):
 *   node scripts/import-partners-excel.mjs "<xlsx 경로>" [--dry-run] [--replace-all] [--confirm-prod]
 *
 * DATABASE_URL 환경변수(또는 .env)의 DB에 입력한다.
 * - 기본: 같은 source 값으로 넣은 기존 행만 지우고 다시 넣는다 (직접 등록한 MANUAL 행은 유지).
 * - --replace-all: Partner 테이블의 모든 행(MANUAL 포함)을 지우고 엑셀 데이터만 남긴다.
 *   로컬이 아닌 DB에서는 --confirm-prod 가 함께 있어야 실행된다.
 * - --dry-run: DB에 쓰지 않고 요약만 보여준다.
 * 삭제와 입력은 한 트랜잭션이라, 중간에 실패하면 전부 되돌아간다.
 *
 * 매핑: 고객사명→name, 담당자→contactName, 유선번호→phone(정규화), 주소→address/addressDetail,
 *       구분→category, 구분2→subCategory, 고객사 구분→customerType, 중앙→centerName,
 *       중서남부→regionGroup, 고객사ID→externalId,
 *       담당자에서 중앙을 뺀 이름→salesRepName (예: 수원이지원 - 수원 = 이지원)
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import pg from 'pg';

const SHEET_NAME = '고객사-최종';
const SOURCE = process.env.PARTNER_IMPORT_SOURCE ?? 'EXCEL_FINAL_202611';
const BATCH_SIZE = 1000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const replaceAll = args.includes('--replace-all');
const confirmProd = args.includes('--confirm-prod');
const filePath = args.find((a) => !a.startsWith('--'));

if (!filePath) {
  console.error(
    'Usage: node scripts/import-partners-excel.mjs "<xlsx 경로>" [--dry-run] [--replace-all] [--confirm-prod]',
  );
  process.exit(1);
}

function isLocalDb(connectionString) {
  return /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
}

function buildPoolConfig(connectionString) {
  if (isLocalDb(connectionString)) {
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

/** 도로명+건물번호(+참고항목) 뒤의 층·호수·건물명을 상세주소로 나눈다 (마이그레이션 20261111150000 과 같은 규칙) */
const ADDRESS_SPLIT_RE =
  /^(.*?(?:로|길)\s?\d+(?:-\d+)?(?:\s?\([^)]*\))?)(?:[\s,]+(.*))?$/;

function splitAddress(raw) {
  const m = raw.match(ADDRESS_SPLIT_RE);
  if (!m || !m[2]) return [raw, null];
  const detail = m[2].replace(/^[\s,.]+|[\s,.]+$/g, '');
  return [m[1], detail || null];
}

/** 숫자만 있는 유선번호에 하이픈을 넣는다. 형식에 맞지 않으면 null */
function formatLandline(d) {
  const split = (head, rest) => {
    if (rest.length === 7) return `${head}-${rest.slice(0, 3)}-${rest.slice(3)}`;
    if (rest.length === 8) return `${head}-${rest.slice(0, 4)}-${rest.slice(4)}`;
    return null;
  };
  if (d.startsWith('02')) return split('02', d.slice(2));
  if (/^050\d/.test(d)) return split(d.slice(0, 4), d.slice(4)); // 0502·0507 안심번호
  if (/^1[5-9]\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`; // 1588-0000
  if (/^0\d{2}/.test(d)) return split(d.slice(0, 3), d.slice(3));
  return null;
}

/**
 * 유선번호 정규화.
 * kind: empty | ok(원본 그대로) | fixed(형식 수정) | kept(형식 불명, 원본 유지) | mobile(휴대폰 → 비움)
 */
function normalizePhone(raw) {
  const original = raw.trim();
  if (!original) return { value: null, kind: 'empty' };
  const first = original.split(/[~/,]/)[0].trim();
  let digits = first.replace(/\D/g, '');
  // 엑셀 숫자 셀이라 앞의 0이 빠진 번호 (312415771 → 0312415771)
  if (/^[2-6]\d{7,9}$/.test(first)) digits = `0${digits}`;
  if (/^01[016789]/.test(digits)) return { value: null, kind: 'mobile' };
  const formatted = formatLandline(digits);
  if (formatted) {
    return { value: formatted, kind: formatted === original ? 'ok' : 'fixed' };
  }
  return { value: first.replace(/[.\s]+/g, '-'), kind: 'kept' };
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
  const need = [
    '고객사ID',
    '구분',
    '고객사명',
    '구분2',
    '고객사 구분',
    '유선번호',
    '주소',
    '중앙',
    '중서남부',
    '담당자',
  ];
  const missing = need.filter((h) => !header[h]);
  if (missing.length) throw new Error(`헤더 없음: ${missing.join(', ')}`);

  const rows = [];
  const phoneStats = { empty: 0, ok: 0, fixed: 0, kept: 0, mobile: 0 };
  const phoneFixed = [];
  const phoneKept = [];
  const phoneMobile = [];
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
    const [address, addressDetail] = splitAddress(get('주소'));
    const rawPhone = get('유선번호');
    const phone = normalizePhone(rawPhone);
    phoneStats[phone.kind] += 1;
    if (phone.kind === 'fixed') phoneFixed.push(`${rawPhone} → ${phone.value}`);
    if (phone.kind === 'kept') phoneKept.push(`${name}: ${rawPhone}`);
    if (phone.kind === 'mobile') phoneMobile.push(`${name}: ${rawPhone}`);
    rows.push({
      name,
      contactName: manager,
      phone: phone.value,
      address,
      addressDetail,
      externalId: get('고객사ID') || null,
      category: get('구분') || null,
      subCategory: get('구분2') || null,
      customerType: get('고객사 구분') || null,
      centerName: center,
      regionGroup: get('중서남부') || null,
      salesRepName: salesRepFrom(manager, center),
    });
  }
  return {
    rows,
    skippedEmpty,
    skippedNoName,
    phoneStats,
    phoneFixed,
    phoneKept,
    phoneMobile,
  };
}

const COLS = [
  'name',
  'contactName',
  'phone',
  'address',
  'addressDetail',
  'externalId',
  'category',
  'subCategory',
  'customerType',
  'centerName',
  'regionGroup',
  'salesRepName',
];

async function main() {
  const { rows, skippedEmpty, skippedNoName, phoneStats, phoneFixed, phoneKept, phoneMobile } =
    await readRows();
  console.log(`source        : ${SOURCE}`);
  console.log(`모드          : ${replaceAll ? '전체 교체(MANUAL 포함 삭제)' : `${SOURCE} 행만 교체`}`);
  console.log(`입력 대상     : ${rows.length}`);
  console.log(`건너뜀(빈 행) : ${skippedEmpty}`);
  console.log(`건너뜀(이름無): ${skippedNoName}`);
  console.log(`상세주소 분리 : ${rows.filter((r) => r.addressDetail).length}`);
  console.log(`담당자 없음   : ${rows.filter((r) => !r.contactName).length}`);
  console.log(`salesRepName  : ${rows.filter((r) => r.salesRepName).length}`);
  console.log('연락처 정규화 :', phoneStats);
  console.log(`  형식 수정 예: ${phoneFixed.slice(0, 10).join(' | ')}`);
  console.log(`  원본 유지(${phoneKept.length}):`);
  phoneKept.forEach((line) => console.log(`    ${line}`));
  console.log(`  휴대폰→비움(${phoneMobile.length}): ${phoneMobile.join(' | ')}`);
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
  if (replaceAll && !isLocalDb(connectionString) && !confirmProd) {
    throw new Error(
      '로컬이 아닌 DB에서 --replace-all 을 실행하려면 --confirm-prod 를 함께 주세요.',
    );
  }

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = replaceAll
      ? await client.query('DELETE FROM "Partner"')
      : await client.query('DELETE FROM "Partner" WHERE "source" = $1', [SOURCE]);
    console.log(`기존 행 삭제  : ${del.rowCount}`);

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
