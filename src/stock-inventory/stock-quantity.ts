/**
 * 재고 반영 규칙 (UI 표시: "남은 수량 / 누적 총 입고량")
 *
 * - stock    = 남은 수량. 주문이 들어오면 차감된다.
 * - stockMax = 누적 총 입고량. 최초 등록 수량 + 이후 모든 입고의 합이므로
 *              입고할 때마다 stock 과 함께 올라간다 (3 등록 → 2 판매 → 10 입고 = 12/13).
 *
 * 입력 규칙
 * - stockIn   : 이번에 추가 입고한 수량. stock 과 stockMax 에 함께 더한다.
 * - stock     : 실사 정정용 절대값. undefined 면 현재 수량을 그대로 둔다(가격만 수정하는 경우).
 *               정정으로 늘어난 분은 입고로 간주해 분모에 더하고, 줄어든 정정은 분모를 유지한다.
 * - stockMax  : 분모를 직접 지정할 때만 사용한다(엑셀 일괄등록 등).
 * - stock === null 이면 재고 미추적(무제한)이라 분모도 두지 않는다.
 */
export function resolveStockChange(input: {
  previousStock: number | null | undefined;
  previousStockMax: number | null | undefined;
  stock?: number | null;
  stockMax?: number | null;
  stockIn?: number | null;
}): { stock: number | null; stockMax: number | null } {
  const prevStock = input.previousStock ?? null;
  const prevStockMax = input.previousStockMax ?? null;
  const stockIn =
    input.stockIn !== null && input.stockIn !== undefined && input.stockIn > 0
      ? input.stockIn
      : 0;

  let stock = input.stock !== undefined ? input.stock : prevStock;
  let stockMax =
    input.stockMax !== undefined ? input.stockMax : prevStockMax ?? prevStock;

  // 절대값 정정: 늘어난 분만 누적 입고량에 반영한다.
  if (
    input.stockMax === undefined &&
    stock !== null &&
    prevStock !== null &&
    stock > prevStock
  ) {
    stockMax = (stockMax ?? prevStock) + (stock - prevStock);
  }

  // 추가 입고분은 남은 수량과 누적 입고량에 함께 더한다.
  if (stockIn > 0) {
    stock = (stock ?? 0) + stockIn;
    stockMax = (stockMax ?? 0) + stockIn;
  }

  if (stock === null) {
    return { stock: null, stockMax: input.stockMax ?? null };
  }

  return {
    stock,
    stockMax: stockMax === null ? stock : Math.max(stockMax, stock),
  };
}
