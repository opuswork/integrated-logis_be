import { randomInt } from 'crypto';

/**
 * 주문번호 채번.
 *
 * 형식: `SYN` + 10자리 난수 (예: SYN4839201756).
 *
 * 형제(분할) 주문은 `SYN…-1`, `SYN…-2` 로 표기하지만 **이 접미사는 표시용일 뿐이다.**
 * 형제 관계는 Order.orderGroupKey 컬럼으로 찾는다. 예전에 주문번호 문자열을 파싱해
 * 형제를 찾다가, 번호 자체가 숫자로 끝나는 탓에 같은 해 주문이 전부 형제로 잡히는
 * 버그가 있었다. 번호 형식에 구조를 기대지 말 것.
 */
const PREFIX = 'SYN';
const DIGITS = 10;

export const ORDER_NUMBER_PATTERN = /^SYN\d{10}$/;

/** SYN + 10자리 난수. 앞자리가 0 이어도 되도록 자리수를 채운다. */
export function generateOrderGroupKey(): string {
  let digits = '';
  // randomInt 는 상한이 2^48 이라 10자리를 한 번에 뽑지 않고 나눠 붙인다.
  while (digits.length < DIGITS) {
    digits += String(randomInt(0, 1_000_000)).padStart(6, '0');
  }
  return `${PREFIX}${digits.slice(0, DIGITS)}`;
}

/**
 * 표시용 주문번호를 만든다.
 * 단일 주문이면 그룹키 그대로, 분할이면 `-1`, `-2` … 를 붙인다.
 */
export function buildOrderNumber(
  groupKey: string,
  index: number,
  total: number,
): string {
  if (total <= 1) {
    return groupKey;
  }
  return `${groupKey}-${index}`;
}

/** SYN 채번으로 만든 번호인지 (구 ORD-… 번호와 구분할 때 쓴다) */
export function isSynOrderNumber(value: string): boolean {
  return ORDER_NUMBER_PATTERN.test(value);
}
