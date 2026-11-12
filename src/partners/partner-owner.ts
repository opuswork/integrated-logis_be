/**
 * 거래처 소유자 판정·주소/전화 정리 (scripts/partner-import-utils.mjs 와 같은 규칙).
 * 스크립트와 규칙이 달라지면 개인앱 검색 범위가 어긋나므로 함께 고친다.
 */

/** 지역이 아닌 중앙·담당자 값 */
const NON_REGION = new Set(['관리자', '쇼핑몰', '폐점']);
/** 사람이 아닌 담당자 값 → 그 행의 중앙 지역 소유 */
const STATUS_VALUES = new Set(['폐점', '폐업', '출장소', '통폐합', '쇼핑몰']);
/** 지역+이름 형태지만 회원 이름으로 쓰는 값 */
const NAMED_OWNERS = new Set(['기소관']);
/** 사람 이름으로 보지 않는 나머지 (서울8학생 등) */
const IGNORED_SUFFIXES = new Set(['학생', '관']);

export type RegionNames = { set: Set<string>; ordered: string[] };

export type PartnerOwner = {
  ownerName: string | null;
  ownerRegion: string | null;
};

/** 지역 이름 목록: 교회 이름 + 거래처 중앙 값 (긴 이름부터 비교) */
export function buildRegionNames(
  names: Iterable<string | null | undefined>,
): RegionNames {
  const set = new Set<string>();
  for (const raw of names) {
    const name = String(raw ?? '').trim();
    if (name && !NON_REGION.has(name)) set.add(name);
  }
  return { set, ordered: [...set].sort((a, b) => b.length - a.length) };
}

/**
 * 거래처 한 건의 소유자.
 * - 본사(중서남부=본사)·회원 직접 등록(MANUAL): 소유자 없음
 * - 사람 담당자: ownerName (지역 접두어·공백·하이픈을 뗀 이름)
 * - 지역 담당자: ownerRegion (담당자가 지역 이름이면 그 이름, 관리자·상태값 등은 그 행의 중앙)
 */
export function classifyOwner(
  row: {
    contactName?: string | null;
    centerName?: string | null;
    regionGroup?: string | null;
    source?: string | null;
  },
  regions: RegionNames,
): PartnerOwner {
  const none = { ownerName: null, ownerRegion: null };
  if (row.source === 'MANUAL' || row.regionGroup === '본사') return none;
  const manager = String(row.contactName ?? '').trim();
  const center = String(row.centerName ?? '').trim() || null;
  const byCenter = { ownerName: null, ownerRegion: center };

  if (!manager || manager === '관리자' || STATUS_VALUES.has(manager)) {
    return byCenter;
  }
  if (regions.set.has(manager))
    return { ownerName: null, ownerRegion: manager };
  if (NAMED_OWNERS.has(manager))
    return { ownerName: manager, ownerRegion: null };

  let rest = manager;
  for (const prefix of regions.ordered) {
    if (rest.startsWith(prefix)) {
      rest = rest
        .slice(prefix.length)
        .replace(/^[\s-]+/, '')
        .trim();
      break;
    }
  }
  if (/^[가-힣]{2,4}$/.test(rest) && !IGNORED_SUFFIXES.has(rest)) {
    return { ownerName: rest, ownerRegion: null };
  }
  return byCenter;
}

/** 도로명+건물번호(+참고항목) 뒤의 층·호수·건물명을 상세주소로 나눈다 */
const ADDRESS_SPLIT_RE =
  /^(.*?(?:로|길)\s?\d+(?:-\d+)?(?:\s?\([^)]*\))?)(?:[\s,]+(.*))?$/;

export function splitAddress(raw: string): [string, string | null] {
  const text = raw.replace(/\s+/g, ' ').trim();
  const m = text.match(ADDRESS_SPLIT_RE);
  if (!m || !m[2]) return [text, null];
  const detail = m[2].replace(/^[\s,.]+|[\s,.]+$/g, '');
  return [m[1], detail || null];
}

/** 엑셀 숫자 셀이라 앞의 0이 빠진 번호를 되살린 숫자열 (312415771 → 0312415771) */
export function phoneDigits(text: string): string {
  const digits = text.replace(/\D/g, '');
  return /^(?:[2-6]\d{7,9}|1[016789]\d{7,8})$/.test(digits)
    ? `0${digits}`
    : digits;
}

/** 숫자만 있는 전화번호에 하이픈을 넣는다. 형식에 맞지 않으면 null */
export function formatPhoneDigits(d: string): string | null {
  const split = (head: string, rest: string) => {
    if (rest.length === 7)
      return `${head}-${rest.slice(0, 3)}-${rest.slice(3)}`;
    if (rest.length === 8)
      return `${head}-${rest.slice(0, 4)}-${rest.slice(4)}`;
    return null;
  };
  if (d.startsWith('02')) return split('02', d.slice(2));
  if (/^050\d/.test(d)) return split(d.slice(0, 4), d.slice(4));
  if (/^1[5-9]\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (/^0\d{2}/.test(d)) return split(d.slice(0, 3), d.slice(3));
  return null;
}

export function isMobileNumber(value: string): boolean {
  return /^01[016789]\d{7,8}$/.test(value.replace(/\D/g, ''));
}

/** 입력한 번호를 하이픈 형식으로 (형식을 모르면 앞뒤 공백만 정리) */
export function normalizePhone(raw: string | null | undefined): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  return formatPhoneDigits(phoneDigits(text)) ?? text;
}
