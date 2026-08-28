/**
 * Alpha test reset: clear ops data (orders / shipment / release / greetings)
 * and set StockInventory.stock back to initial (INITIAL ledger sum or stockMax).
 *
 * Keeps: User, Church, StockInventory master rows.
 *
 * Usage (from be/):
 *   ALPHA_RESET_CONFIRM=YES node scripts/alpha-reset-ops-data.mjs
 *
 * Reads DATABASE_URL from .env. Irreversible — confirm flag required.
 */
import 'dotenv/config';
import pg from 'pg';

function buildPoolConfig(connectionString) {
  if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString)) {
    return { connectionString };
  }
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
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
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function count(client, sql) {
  const res = await client.query(sql);
  return Number(res.rows[0]?.c ?? 0);
}

async function main() {
  if (process.env.ALPHA_RESET_CONFIRM !== 'YES') {
    console.error(
      'Refusing to run: set ALPHA_RESET_CONFIRM=YES to wipe ops data.',
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  console.log('Target DB:', maskDbUrl(connectionString));

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const before = {
      orders: await count(client, 'SELECT COUNT(*)::int AS c FROM "Order"'),
      shipments: await count(client, 'SELECT COUNT(*)::int AS c FROM "Shipment"'),
      orderItems: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "OrderItem"',
      ),
      greetings: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "greeting_form"',
      ),
      activities: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "AdminActivity"',
      ),
      deductLedgers: await count(
        client,
        `SELECT COUNT(*)::int AS c FROM "stock_inventory_ledger" WHERE type = 'ORDER_DEDUCT'`,
      ),
      additionLedgers: await count(
        client,
        `SELECT COUNT(*)::int AS c FROM "stock_inventory_ledger" WHERE type = 'ADDITION'`,
      ),
    };
    console.log('Before:', before);

    // Order cascades Shipment + OrderItem; GreetingForm is SetNull — delete explicitly.
    await client.query('DELETE FROM "greeting_form"');
    await client.query('DELETE FROM "AdminActivity"');
    await client.query('DELETE FROM "Order"');

    await client.query(
      `DELETE FROM "stock_inventory_ledger" WHERE type IN ('ORDER_DEDUCT', 'ADDITION')`,
    );

    const products = await client.query(`
      SELECT s.id, s.stock, s."stockMax",
             (
               SELECT SUM(l.delta)::int
               FROM "stock_inventory_ledger" l
               WHERE l."productId" = s.id AND l.type = 'INITIAL'
             ) AS initial_sum
      FROM "stock_inventory" s
      WHERE s.stock IS NOT NULL
    `);

    let stockUpdated = 0;
    for (const row of products.rows) {
      const next =
        row.initial_sum != null
          ? Number(row.initial_sum)
          : row.stockMax != null
            ? Number(row.stockMax)
            : Number(row.stock);
      if (next === Number(row.stock)) continue;
      await client.query(
        `UPDATE "stock_inventory" SET stock = $1, "updatedAt" = NOW() WHERE id = $2`,
        [next, row.id],
      );
      stockUpdated += 1;
    }

    const after = {
      orders: await count(client, 'SELECT COUNT(*)::int AS c FROM "Order"'),
      shipments: await count(client, 'SELECT COUNT(*)::int AS c FROM "Shipment"'),
      orderItems: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "OrderItem"',
      ),
      greetings: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "greeting_form"',
      ),
      activities: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "AdminActivity"',
      ),
      deductLedgers: await count(
        client,
        `SELECT COUNT(*)::int AS c FROM "stock_inventory_ledger" WHERE type = 'ORDER_DEDUCT'`,
      ),
      additionLedgers: await count(
        client,
        `SELECT COUNT(*)::int AS c FROM "stock_inventory_ledger" WHERE type = 'ADDITION'`,
      ),
      initialLedgers: await count(
        client,
        `SELECT COUNT(*)::int AS c FROM "stock_inventory_ledger" WHERE type = 'INITIAL'`,
      ),
      users: await count(client, 'SELECT COUNT(*)::int AS c FROM "User"'),
      churches: await count(client, 'SELECT COUNT(*)::int AS c FROM "Church"'),
      products: await count(
        client,
        'SELECT COUNT(*)::int AS c FROM "stock_inventory"',
      ),
    };

    await client.query('COMMIT');

    console.log('Stock rows updated:', stockUpdated);
    console.log('After:', after);
    console.log('Alpha ops reset complete.');
  } catch (err) {
    await client.query('ROLLBACK');
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
