import { resolveStockChange } from './stock-quantity';

describe('resolveStockChange (남은 수량 / 누적 총 입고량)', () => {
  const at = (stock: number | null, stockMax: number | null) => ({
    previousStock: stock,
    previousStockMax: stockMax,
  });

  it('신규 등록 수량이 분모의 출발점이 된다 (3 → 3/3)', () => {
    expect(
      resolveStockChange({
        previousStock: null,
        previousStockMax: null,
        stock: 3,
      }),
    ).toEqual({ stock: 3, stockMax: 3 });
  });

  it('입고 수량은 남은 수량과 누적 입고량에 함께 더해진다 (2/3 + 10 → 12/13)', () => {
    expect(resolveStockChange({ ...at(2, 3), stockIn: 10 })).toEqual({
      stock: 12,
      stockMax: 13,
    });
  });

  it('입고를 반복해도 누적된다 (12/13 + 5 → 17/18)', () => {
    expect(resolveStockChange({ ...at(12, 13), stockIn: 5 })).toEqual({
      stock: 17,
      stockMax: 18,
    });
  });

  it('재고를 건드리지 않는 수정(가격 등)에서는 분모가 보존된다', () => {
    expect(resolveStockChange(at(2, 3))).toEqual({ stock: 2, stockMax: 3 });
  });

  it('같은 수량을 다시 보내도 덮어쓰기로 분모가 깨지지 않는다', () => {
    expect(resolveStockChange({ ...at(2, 3), stock: 2 })).toEqual({
      stock: 2,
      stockMax: 3,
    });
  });

  it('실사 정정으로 늘리면 늘어난 분만 입고로 잡힌다 (2/3 → 15 → 15/16)', () => {
    expect(resolveStockChange({ ...at(2, 3), stock: 15 })).toEqual({
      stock: 15,
      stockMax: 16,
    });
  });

  it('실사 정정으로 줄이면 누적 입고량은 유지된다 (10/13 → 5 → 5/13)', () => {
    expect(resolveStockChange({ ...at(10, 13), stock: 5 })).toEqual({
      stock: 5,
      stockMax: 13,
    });
  });

  it('무제한(미추적) 상품에 입고하면 추적이 시작된다 (null + 10 → 10/10)', () => {
    expect(resolveStockChange({ ...at(null, null), stockIn: 10 })).toEqual({
      stock: 10,
      stockMax: 10,
    });
  });

  it('무제한으로 되돌리면 분모도 비운다', () => {
    expect(resolveStockChange({ ...at(2, 3), stock: null })).toEqual({
      stock: null,
      stockMax: null,
    });
  });

  it('입고 0 또는 미입력은 재고를 바꾸지 않는다', () => {
    expect(resolveStockChange({ ...at(2, 3), stockIn: 0 })).toEqual({
      stock: 2,
      stockMax: 3,
    });
    expect(resolveStockChange({ ...at(2, 3), stockIn: null })).toEqual({
      stock: 2,
      stockMax: 3,
    });
  });

  it('분모가 없던 기존 데이터도 남은 수량 이상으로 보정된다', () => {
    expect(resolveStockChange({ ...at(7, null), stockIn: 3 })).toEqual({
      stock: 10,
      stockMax: 10,
    });
  });
});
