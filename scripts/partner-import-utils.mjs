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

/** 엑셀 숫자 셀이라 앞의 0이 빠진 번호를 되살린 숫자열 (312415771 → 0312415771) */
export function phoneDigits(text) {
  const digits = text.replace(/\D/g, '');
  // 지역번호(2~6으로 시작) 또는 휴대폰(10·11·16~19로 시작)인데 0이 빠진 경우만
  return /^(?:[2-6]\d{7,9}|1[016789]\d{7,8})$/.test(text) ? `0${digits}` : digits;
}
