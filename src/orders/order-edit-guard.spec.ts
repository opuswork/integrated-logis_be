import {
  canEditOrderContent,
  canEditOrderStatus,
  describeOrderEditLock,
} from './order-edit-guard';

const OPEN = { status: 'PLACED', packDone: false, finalConfirmDone: false };

describe('canEditOrderStatus', () => {
  it('접수~상차통보 단계는 수정할 수 있다', () => {
    for (const status of [
      'PLACED',
      'WAITING_FOR_SHIPMENT',
      'PREPARED',
      'LOAD_NOTIFIED',
    ]) {
      expect(canEditOrderStatus(status)).toBe(true);
    }
  });

  it('배송중 이후는 수정할 수 없다', () => {
    for (const status of [
      'SHIPPING',
      'RECEIVED',
      'PRINTING_COMPLETE',
      'CANCELLED',
    ]) {
      expect(canEditOrderStatus(status)).toBe(false);
    }
  });
});

describe('describeOrderEditLock (수량·배송방식 수정 가능 여부)', () => {
  it('포장 전 · 발송 전이면 잠기지 않는다', () => {
    expect(describeOrderEditLock(OPEN)).toBeNull();
    expect(canEditOrderContent(OPEN)).toBe(true);
  });

  it('포장완료되면 잠근다', () => {
    const lock = describeOrderEditLock({ ...OPEN, packDone: true });
    expect(lock).toMatch(/포장완료/);
    expect(canEditOrderContent({ ...OPEN, packDone: true })).toBe(false);
  });

  it('발송완료되면 잠근다', () => {
    const lock = describeOrderEditLock({ ...OPEN, finalConfirmDone: true });
    expect(lock).toMatch(/발송완료/);
  });

  it('배송중 이후는 포장·발송 플래그와 무관하게 잠근다', () => {
    expect(describeOrderEditLock({ ...OPEN, status: 'SHIPPING' })).toMatch(
      /배송중 이후/,
    );
  });

  it('상태 잠금이 포장·발송 잠금보다 우선 안내된다', () => {
    const lock = describeOrderEditLock({
      status: 'RECEIVED',
      packDone: true,
      finalConfirmDone: true,
    });
    expect(lock).toMatch(/배송중 이후/);
  });

  it('null/undefined 플래그는 "아직 아님"으로 본다', () => {
    expect(
      describeOrderEditLock({
        status: 'PLACED',
        packDone: null,
        finalConfirmDone: undefined,
      }),
    ).toBeNull();
  });
});
