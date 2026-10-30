import { OrderStatus } from '../generated/prisma/client';

/**
 * 주문 내용(수량·배송방식·상품)을 고칠 수 있는지 판정한다.
 *
 * 제품주문서(수정)에서 수량/배송선택을 열어 주되, 현장 작업이 시작된 뒤에는 막아야 한다.
 * - 포장관리에서 '완료'(packDone) → 이미 포장된 수량이라 못 바꾼다
 * - 배송관리 '최종확인'의 '발송완료'(finalConfirmDone) → 이미 나간 건이라 못 바꾼다
 *
 * 순수 함수로 둬서 서비스와 테스트가 같은 규칙을 쓴다.
 */
export type OrderEditLockInput = {
  status: OrderStatus | string;
  packDone?: boolean | null;
  finalConfirmDone?: boolean | null;
};

/** 배송중 이후로 넘어가면 주문 자체를 수정할 수 없다 */
export function canEditOrderStatus(status: OrderStatus | string): boolean {
  return (
    status === OrderStatus.PLACED ||
    status === OrderStatus.WAITING_FOR_SHIPMENT ||
    status === OrderStatus.PREPARED ||
    status === OrderStatus.LOAD_NOTIFIED
  );
}

/**
 * 수정을 막아야 하면 사용자에게 보여 줄 사유를, 고칠 수 있으면 null 을 돌려준다.
 * 사유를 같이 주는 이유: 화면에서 "왜 잠겼는지"를 그대로 띄우기 위해서다.
 */
export function describeOrderEditLock(
  order: OrderEditLockInput,
): string | null {
  if (!canEditOrderStatus(order.status)) {
    return '배송중 이후 주문은 수정할 수 없습니다.';
  }
  if (order.packDone) {
    return '포장완료된 주문은 수량·배송방식을 수정할 수 없습니다.';
  }
  if (order.finalConfirmDone) {
    return '발송완료된 주문은 수량·배송방식을 수정할 수 없습니다.';
  }
  return null;
}

export type MemberOrderLockInput = {
  status: OrderStatus | string;
  packagingWorker?: 'STORE' | 'FACTORY' | string | null;
  packDept?: string | null;
  finalConfirmDone?: boolean | null;
};

/**
 * 회원(주문자 본인)이 주문을 수정·취소할 수 있는지. 관리자보다 좁다.
 * - 접수·접수완료(PLACED / WAITING_FOR_SHIPMENT) 상태에서만
 * - 작업자 매장: 배송관리 '발송완료'(finalConfirmDone) 전까지
 * - 작업자 공장: 포장관리 '포장 전' 동안 (공장포장/양말부포장 지정되면 packDept 가 생긴다)
 * - 작업자 미지정: 가능
 */
export function describeMemberOrderLock(
  order: MemberOrderLockInput,
): string | null {
  if (
    order.status !== OrderStatus.PLACED &&
    order.status !== OrderStatus.WAITING_FOR_SHIPMENT
  ) {
    return '접수·접수완료 상태에서만 수정·삭제할 수 있습니다.';
  }
  if (order.packagingWorker === 'STORE' && order.finalConfirmDone) {
    return '발송완료된 주문은 수정·삭제할 수 없습니다.';
  }
  if (order.packagingWorker === 'FACTORY' && order.packDept) {
    return '포장이 시작된 주문은 수정·삭제할 수 없습니다.';
  }
  return null;
}

/** 포장완료·발송완료 전까지만 주문 내용을 고칠 수 있다 */
export function canEditOrderContent(order: OrderEditLockInput): boolean {
  return describeOrderEditLock(order) === null;
}
