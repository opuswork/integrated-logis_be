/**
 * Clear all orders so admin 주문관리 list is empty.
 * Cascades Shipment + OrderItem. Unlinks GreetingForm.orderId.
 * Keeps User, Church, StockInventory, greeting_form rows.
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
    };
    console.log("Before:", before);

    await client.query('DELETE FROM "AdminActivity"');
    await client.query('DELETE FROM "Order"');

    const after = {
      orders: await count(client, 'SELECT COUNT(*)::int AS c FROM "Order"'),
      shipments: await count(client, 'SELECT COUNT(*)::int AS c FROM "Shipment"'),
      orderItems: await count(client, 'SELECT COUNT(*)::int AS c FROM "OrderItem"'),
      users: await count(client, 'SELECT COUNT(*)::int AS c FROM "User"'),
      churches: await count(client, 'SELECT COUNT(*)::int AS c FROM "Church"'),
      products: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "stock_inventory"',
      ),
    };

    await client.query("COMMIT");
    console.log("After:", after);
    console.log("Orders cleared.");
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
