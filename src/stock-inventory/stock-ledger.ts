import {
  Prisma,
  StockLedgerType,
} from '../generated/prisma/client';

export const STOCK_ACTOR_FACTORY = '공장 관리자';
export const STOCK_ACTOR_ORDER_AUTO = '자동(주문관리 연동)';
export const LOW_STOCK_THRESHOLD = 30;

type Tx = Prisma.TransactionClient | {
  stockInventoryLedger: {
    create: (args: {
      data: {
        productId: number;
        productName: string;
        type: StockLedgerType;
        delta: number;
        actorLabel: string;
        orderId?: number | null;
      };
    }) => Promise<unknown>;
  };
};

export async function writeStockLedger(
  tx: Tx,
  input: {
    productId: number;
    productName: string;
    type: StockLedgerType;
    delta: number;
    actorLabel: string;
    orderId?: number | null;
  },
) {
  if (input.delta === 0) {
    return;
  }
  await tx.stockInventoryLedger.create({
    data: {
      productId: input.productId,
      productName: input.productName,
      type: input.type,
      delta: input.delta,
      actorLabel: input.actorLabel,
      orderId: input.orderId ?? null,
    },
  });
}

/** Admin create/update stock change → INITIAL or ADDITION */
export async function recordAdminStockChange(
  tx: Tx,
  input: {
    productId: number;
    productName: string;
    previousStock: number | null | undefined;
    nextStock: number | null | undefined;
  },
) {
  const prev =
    input.previousStock === undefined ? null : input.previousStock;
  const next = input.nextStock === undefined ? null : input.nextStock;

  if (prev === next) {
    return;
  }

  if (prev === null && next !== null) {
    await writeStockLedger(tx, {
      productId: input.productId,
      productName: input.productName,
      type: StockLedgerType.INITIAL,
      delta: next,
      actorLabel: STOCK_ACTOR_FACTORY,
    });
    return;
  }

  if (prev !== null && next !== null && next !== prev) {
    await writeStockLedger(tx, {
      productId: input.productId,
      productName: input.productName,
      type: StockLedgerType.ADDITION,
      delta: next - prev,
      actorLabel: STOCK_ACTOR_FACTORY,
    });
  }
}
