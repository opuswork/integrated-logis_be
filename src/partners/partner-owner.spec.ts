import {
  buildRegionNames,
  classifyOwner,
  isMobileNumber,
  normalizePhone,
  splitAddress,
} from './partner-owner';

const regions = buildRegionNames([
  '기소',
  '서울5',
  '서울17',
  '천안',
  '송탄',
  '광주1',
  '관리자',
]);

describe('classifyOwner', () => {
  it.each([
    ['기소 김연정', '기소', null, { ownerName: '김연정', ownerRegion: null }],
    ['서울5-유복희', '서울5', null, { ownerName: '유복희', ownerRegion: null }],
    ['광주1양수영', '광주1', null, { ownerName: '양수영', ownerRegion: null }],
    ['기소관', '기소', null, { ownerName: '기소관', ownerRegion: null }],
    ['관리자', '서울17', null, { ownerName: null, ownerRegion: '서울17' }],
    ['천안', '송탄', null, { ownerName: null, ownerRegion: '천안' }],
    ['폐점', '천안', null, { ownerName: null, ownerRegion: '천안' }],
    ['서울5학생', '서울5', null, { ownerName: null, ownerRegion: '서울5' }],
    ['관리자', '본사', '본사', { ownerName: null, ownerRegion: null }],
  ])('%s (중앙 %s) → %o', (contactName, centerName, regionGroup, expected) => {
    expect(
      classifyOwner({ contactName, centerName, regionGroup }, regions),
    ).toEqual(expected);
  });

  it('회원이 직접 등록한 거래처(MANUAL)는 소유자가 없다', () => {
    expect(
      classifyOwner(
        { contactName: '기소 김연정', centerName: '기소', source: 'MANUAL' },
        regions,
      ),
    ).toEqual({ ownerName: null, ownerRegion: null });
  });
});

describe('splitAddress', () => {
  it('도로명 주소 뒤의 층·호수를 상세주소로 나눈다', () => {
    expect(splitAddress('서울 강남구 테헤란로 152, 3층 301호')).toEqual([
      '서울 강남구 테헤란로 152',
      '3층 301호',
    ]);
    expect(splitAddress('서울 중구 세종대로 110')).toEqual([
      '서울 중구 세종대로 110',
      null,
    ]);
  });
});

describe('phone helpers', () => {
  it('하이픈을 넣고 빠진 0을 되살린다', () => {
    expect(normalizePhone('01012345678')).toBe('010-1234-5678');
    expect(normalizePhone('1012345678')).toBe('010-1234-5678');
    expect(normalizePhone('0212345678')).toBe('02-1234-5678');
    expect(normalizePhone('312415771')).toBe('031-241-5771');
    expect(normalizePhone('')).toBeNull();
  });

  it('휴대폰 번호를 가린다', () => {
    expect(isMobileNumber('010-1234-5678')).toBe(true);
    expect(isMobileNumber('02-123-4567')).toBe(false);
  });
});
