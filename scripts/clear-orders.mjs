/**
 * 주문 데이터를 비웁니다. 주문관리·배송관리·출고관리는 모두 "Order" 를 보는 화면이라
 * 주문을 지우면 세 목록이 함께 빕니다. Shipment·OrderItem 은 cascade 로 따라 지워집니다.
 *
 * 함께 처리하는 것:
 *   - 인사장(greeting_form) 전부 삭제. GreetingForm.orderId 가 SetNull 이라
 *     주문만 지우면 주인 없는 인사장이 남습니다.
 *   - 테스트 주문으로 깎인 재고 복원. Order 삭제 경로(remove)는 재고를 되돌리지
 *     않으므로 여기서 원장(ORDER_DEDUCT) 합계만큼 stock_inventory.stock 을 되돌리고
 *     그 원장 행도 지웁니다. 취소로 이미 복원된 분은 원장에 +행이 남아 합계가
 *     상쇄되므로 이중 복원되지 않습니다.
 *
 * 유지: User, Church, StockInventory(품목 자체)
 *
 * Usage (from be/):
 *   CLEAR_ORDERS_CONFIRM=YES node scripts/clear-orders.mjs
 */
import "dotenv/config";
import pg from "pg";

function buildPoolConfig(connectionString) {
  if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString)) {
    return { connectionString };
  }
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    return {
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
    };
  } catch {
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }
}

function maskDbUrl(connectionString) {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function count(client, sql) {
  const res = await client.query(sql);
  return Number(res.rows[0]?.c ?? 0);
}

async function main() {
  if (process.env.CLEAR_ORDERS_CONFIRM !== "YES") {
    console.error("Refusing to run: set CLEAR_ORDERS_CONFIRM=YES");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log("Target DB:", maskDbUrl(connectionString));

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const before = {
      orders: await count(client, 'SELECT COUNT(*)::int AS c FROM "Order"'),
      shipments: await count(client, 'SELECT COUNT(*)::int AS c FROM "Shipment"'),
      orderItems: await count(client, 'SELECT COUNT(*)::int AS c FROM "OrderItem"'),
      greetingForms: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "greeting_form"',
      ),
      deductLedgers: await count(
        client,
        `SELECT COUNT(*)::int AS c FROM "stock_inventory_ledger" WHERE "type" = 'ORDER_DEDUCT'`,
      ),
    };
    console.log("Before:", before);

    /*
     * 재고 복원. 원장의 ORDER_DEDUCT 합계는 차감(-)과 취소 복원(+)이 섞여 있어
     * 순합이 곧 "아직 덜 돌려준 양"(음수)입니다. 빼 주면 원래 수량으로 돌아갑니다.
     * stock 이 null 인 품목은 무제한이라 건드리지 않습니다.
     */
    const restored = await client.query(`
      UPDATE "stock_inventory" AS si
      SET "stock" = si."stock" - agg."net"
      FROM (
        SELECT "productId" AS pid, SUM("delta")::int AS net
        FROM "stock_inventory_ledger"
        WHERE "type" = 'ORDER_DEDUCT'
        GROUP BY "productId"
      ) AS agg
      WHERE si."id" = agg."pid"
        AND si."stock" IS NOT NULL
        AND agg."net" <> 0
      RETURNING si."productName", si."stock", agg."net"
    `);
    for (const row of restored.rows) {
      console.log(
        `  재고 복원: ${row.productName} +${-row.net} → ${row.stock}`,
      );
    }
    await client.query(
      `DELETE FROM "stock_inventory_ledger" WHERE "type" = 'ORDER_DEDUCT'`,
    );

    await client.query('DELETE FROM "AdminActivity"');
    await client.query('DELETE FROM "greeting_form"');
    await client.query('DELETE FROM "Order"');

    const after = {
      orders: await count(client, 'SELECT COUNT(*)::int AS c FROM "Order"'),
      shipments: await count(client, 'SELECT COUNT(*)::int AS c FROM "Shipment"'),
      orderItems: await count(client, 'SELECT COUNT(*)::int AS c FROM "OrderItem"'),
      greetingForms: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "greeting_form"',
      ),
      users: await count(client, 'SELECT COUNT(*)::int AS c FROM "User"'),
      churches: await count(client, 'SELECT COUNT(*)::int AS c FROM "Church"'),
      products: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "stock_inventory"',
      ),
    };

    await client.query("COMMIT");
    console.log("After:", after);
    console.log(
      `Orders cleared. 재고 복원 ${restored.rowCount}개 품목.`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
