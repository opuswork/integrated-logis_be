import {
  ORDER_NUMBER_PATTERN,
  buildOrderNumber,
  generateOrderGroupKey,
  isSynOrderNumber,
} from './order-number';

describe('generateOrderGroupKey', () => {
  it('SYN + 10자리 숫자 형식이다', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOrderGroupKey()).toMatch(ORDER_NUMBER_PATTERN);
    }
  });

  it('길이가 항상 13자다 (SYN 3 + 숫자 10)', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOrderGroupKey()).toHaveLength(13);
    }
  });

  it('연속 생성해도 사실상 겹치지 않는다', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i += 1) {
      seen.add(generateOrderGroupKey());
    }
    // 10^10 중 5000개라 충돌 기대값은 0에 가깝다.
    expect(seen.size).toBe(5000);
  });
});

describe('buildOrderNumber (분할 표기)', () => {
  const key = 'SYN4839201756';

  it('단일 주문은 그룹키를 그대로 쓴다', () => {
    expect(buildOrderNumber(key, 1, 1)).toBe(key);
  });

  it('분할 주문은 -1, -2 를 붙인다', () => {
    expect(buildOrderNumber(key, 1, 2)).toBe('SYN4839201756-1');
    expect(buildOrderNumber(key, 2, 2)).toBe('SYN4839201756-2');
  });

  it('세 갈래 이상도 순서대로 붙는다', () => {
    expect([1, 2, 3].map((i) => buildOrderNumber(key, i, 3))).toEqual([
      'SYN4839201756-1',
      'SYN4839201756-2',
      'SYN4839201756-3',
    ]);
  });

  it('total 이 0 이하로 와도 그룹키를 돌려준다', () => {
    expect(buildOrderNumber(key, 1, 0)).toBe(key);
  });
});

describe('isSynOrderNumber', () => {
  it('SYN 번호만 참이다', () => {
    expect(isSynOrderNumber('SYN4839201756')).toBe(true);
    expect(isSynOrderNumber(generateOrderGroupKey())).toBe(true);
  });

  it('구 ORD 번호와 분할 접미사는 거짓이다', () => {
    expect(isSynOrderNumber('ORD-2026-567480')).toBe(false);
    expect(isSynOrderNumber('SYN4839201756-1')).toBe(false);
    expect(isSynOrderNumber('SYN123')).toBe(false);
    expect(isSynOrderNumber('')).toBe(false);
  });
});
