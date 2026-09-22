/**
 * 기존 상품의 "누적 총 입고량"(stock_inventory.stockMax)을 변동 이력에서 다시 계산한다.
 *
 * 배경: 예전에는 상품을 저장할 때마다 stockMax 가 당시 재고로 덮어써져서
 * "남은 수량/초기 수량" 표시의 분모가 사라졌다. 원장(stock_inventory_ledger)에는
 * INITIAL/ADDITION 이 그대로 남아 있으므로 그 합으로 분모를 복원한다.
 *
 * 남은 수량(stock)은 건드리지 않는다. 계산된 분모가 현재 남은 수량보다 작으면
 * (원장보다 재고가 많은 경우) 남은 수량으로 맞춘다.
 *
 * Usage (from be/):
 *   node scripts/backfill-stock-max.mjs              # 미리보기 (변경 없음)
 *   BACKFILL_STOCK_MAX_CONFIRM=YES node scripts/backfill-stock-max.mjs   # 실제 반영
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

const SELECT_SQL = `
  SELECT
    p."id",
    p."code",
    p."productName",
    p."stock",
    p."stockMax",
    GREATEST(
      COALESCE((
        SELECT SUM(l."delta")::int
        FROM "stock_inventory_ledger" l
        WHERE l."productId" = p."id"
          AND l."type" IN ('INITIAL', 'ADDITION')
      ), 0),
      p."stock"
    ) AS "computedStockMax"
  FROM "stock_inventory" p
  WHERE p."stock" IS NOT NULL
  ORDER BY p."id"
`;

async function main() {
  const apply = process.env.BACKFILL_STOCK_MAX_CONFIRM === "YES";
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log("Target DB:", maskDbUrl(connectionString));
  console.log(apply ? "Mode: APPLY" : "Mode: DRY RUN (미리보기만)");

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();

  try {
    const { rows } = await client.query(SELECT_SQL);
    const changed = rows.filter((r) => r.stockMax !== r.computedStockMax);

    console.log(`재고 추적 상품: ${rows.length}건, 분모 보정 대상: ${changed.length}건`);
    for (const r of changed) {
      console.log(
        `  [${r.code}] ${r.productName}: ${r.stock}/${r.stockMax ?? "-"}` +
          ` → ${r.stock}/${r.computedStockMax}`,
      );
    }

    if (!apply) {
      console.log("\n반영하려면 BACKFILL_STOCK_MAX_CONFIRM=YES 로 다시 실행하세요.");
      return;
    }

    await client.query("BEGIN");
    for (const r of changed) {
      await client.query(
        'UPDATE "stock_inventory" SET "stockMax" = $1 WHERE "id" = $2',
        [r.computedStockMax, r.id],
      );
    }
    await client.query("COMMIT");
    console.log(`\n${changed.length}건 반영 완료.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
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
