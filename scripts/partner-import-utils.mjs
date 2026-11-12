/** 거래처 엑셀 입력 스크립트들이 함께 쓰는 도우미 */

export function isLocalDb(connectionString) {
  return /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
}

export function buildPoolConfig(connectionString) {
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

export function dbHost(connectionString) {
  try {
    return new URL(connectionString).host;
  } catch {
    return '(unknown)';
  }
}

/** exceljs 셀 값 → 문자열 (rich text / 수식 결과 / 숫자 처리) */
export function cellText(value) {
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

export function splitAddress(raw) {
  const text = raw.replace(/\s+/g, ' ').trim();
  const m = text.match(ADDRESS_SPLIT_RE);
  if (!m || !m[2]) return [text, null];
  const detail = m[2].replace(/^[\s,.]+|[\s,.]+$/g, '');
  return [m[1], detail || null];
}

/** 숫자만 있는 전화번호에 하이픈을 넣는다. 형식에 맞지 않으면 null */
export function formatPhoneDigits(d) {
  const split = (head, rest) => {
    if (rest.length === 7) return `${head}-${rest.slice(0, 3)}-${rest.slice(3)}`;
    if (rest.length === 8) return `${head}-${rest.slice(0, 4)}-${rest.slice(4)}`;
    return null;
  };
  if (d.startsWith('02')) return split('02', d.slice(2));
  if (/^050\d/.test(d)) return split(d.slice(0, 4), d.slice(4)); // 0502·0507 안심번호
  if (/^1[5-9]\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`; // 1588-0000
  if (/^0\d{2}/.test(d)) return split(d.slice(0, 3), d.slice(3)); // 0xx, 010 휴대폰 포함
  return null;
}

/* ───────────── 담당자(소유자) 판정 ───────────── */

/** 지역이 아닌 중앙·담당자 값 */
const NON_REGION = new Set(['관리자', '쇼핑몰', '폐점']);
/** 사람이 아닌 담당자 값 → 그 행의 중앙 지역 소유 */
const STATUS_VALUES = new Set(['폐점', '폐업', '출장소', '통폐합', '쇼핑몰']);
/** 지역+이름 형태지만 회원 이름으로 쓰는 값 (사용자 지정) */
const NAMED_OWNERS = new Set(['기소관']);
/** 사람 이름으로 보지 않는 나머지 (사용자 지정: 서울8학생 무시) */
const IGNORED_SUFFIXES = new Set(['학생', '관']);

/** 지역 이름 목록: 교회 이름 + 거래처 중앙 값 (긴 이름부터 비교) */
export function buildRegionNames(names) {
  const set = new Set();
  for (const raw of names) {
    const name = String(raw ?? '').trim();
    if (name && !NON_REGION.has(name)) set.add(name);
  }
  return { set, ordered: [...set].sort((a, b) => b.length - a.length) };
}

/**
 * 거래처 한 건의 소유자.
 * - 본사(중서남부=본사)·직접 등록(MANUAL): 소유자 없음 (본사는 hideInSearch 로 따로 처리)
 * - 사람 담당자: ownerName (지역 접두어·공백·하이픈을 뗀 이름)
 * - 지역 담당자: ownerRegion (담당자가 지역 이름이면 그 이름, 관리자·상태값 등은 그 행의 중앙)
 */
export function classifyOwner({ contactName, centerName, regionGroup, source }, regions) {
  const none = { ownerName: null, ownerRegion: null };
  if (source === 'MANUAL' || regionGroup === '본사') return none;
  const manager = String(contactName ?? '').trim();
  const center = String(centerName ?? '').trim() || null;
  const byCenter = { ownerName: null, ownerRegion: center };

  if (!manager || manager === '관리자' || STATUS_VALUES.has(manager)) return byCenter;
  if (regions.set.has(manager)) return { ownerName: null, ownerRegion: manager };
  if (NAMED_OWNERS.has(manager)) return { ownerName: manager, ownerRegion: null };

  let rest = manager;
  for (const prefix of regions.ordered) {
    if (rest.startsWith(prefix)) {
      rest = rest.slice(prefix.length).replace(/^[\s-]+/, '').trim();
      break;
    }
  }
  if (/^[가-힣]{2,4}$/.test(rest) && !IGNORED_SUFFIXES.has(rest)) {
    return { ownerName: rest, ownerRegion: null };
  }
  return byCenter;
}

/**
 * DB의 거래처 소유자 칸을 다시 계산해 저장한다 (같은 트랜잭션의 client 를 받는다).
 * @param where 추가 조건 SQL (예: `"source" = $1`) 과 값
 */
export async function backfillPartnerOwners(client, { whereSql = 'TRUE', params = [] } = {}) {
  const { rows: names } = await client.query(
    `SELECT name FROM "Church" UNION SELECT DISTINCT "centerName" FROM "Partner" WHERE "centerName" IS NOT NULL`,
  );
  const regions = buildRegionNames(names.map((r) => r.name));
  const { rows } = await client.query(
    `SELECT id, "contactName", "centerName", "regionGroup", source, "ownerName", "ownerRegion"
       FROM "Partner" WHERE ${whereSql}`,
    params,
  );
  const changes = [];
  const stats = { person: 0, region: 0, none: 0, changed: 0 };
  const people = new Set();
  for (const row of rows) {
    const owner = classifyOwner(row, regions);
    if (owner.ownerName) {
      stats.person += 1;
      people.add(owner.ownerName);
    } else if (owner.ownerRegion) stats.region += 1;
    else stats.none += 1;
    if (owner.ownerName !== row.ownerName || owner.ownerRegion !== row.ownerRegion) {
      changes.push([row.id, owner.ownerName, owner.ownerRegion]);
    }
  }
  for (let i = 0; i < changes.length; i += 1000) {
    const batch = changes.slice(i, i + 1000);
    const values = [];
    const tuples = batch.map(([id, name, region], j) => {
      values.push(id, name, region);
      return `($${j * 3 + 1}::int, $${j * 3 + 2}::text, $${j * 3 + 3}::text)`;
    });
    await client.query(
      `UPDATE "Partner" AS p SET "ownerName" = v.name, "ownerRegion" = v.region
         FROM (VALUES ${tuples.join(', ')}) AS v(id, name, region)
        WHERE p.id = v.id`,
      values,
    );
  }
  stats.changed = changes.length;
  stats.people = people.size;
  stats.total = rows.length;
  return stats;
}

/** 엑셀 숫자 셀이라 앞의 0이 빠진 번호를 되살린 숫자열 (312415771 → 0312415771) */
export function phoneDigits(text) {
  const digits = text.replace(/\D/g, '');
  // 지역번호(2~6으로 시작) 또는 휴대폰(10·11·16~19로 시작)인데 0이 빠진 경우만
  return /^(?:[2-6]\d{7,9}|1[016789]\d{7,8})$/.test(text) ? `0${digits}` : digits;
}
