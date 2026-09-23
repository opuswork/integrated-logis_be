/**
 * backfill-stock-max.mjs 가 깎아버린 "누적 총 입고량"(stock_inventory.stockMax)을 되돌린다.
 *
 * 배경: 해당 스크립트는 원장(stock_inventory_ledger)의 INITIAL/ADDITION 합을 분모의
 * 근거로 삼았는데, 이 상품들은 이미 판매가 반영된 수량으로 등록되어 INITIAL 이
 * 최초 입고량보다 작았다. 그 결과 멀쩡하던 분모가 현재 수량까지 내려갔다.
 * 아래 값은 스크립트 실행 전 미리보기 출력에 남아 있던 원래 stockMax 다.
 *
 * stock(남은 수량)은 건드리지 않는다. 현재 stockMax 가 이미 원래 값 이상이면 건너뛴다.
 *
 * Usage (from be/):
 *   node scripts/restore-stock-max.mjs                                  # 미리보기
 *   $env:RESTORE_STOCK_MAX_CONFIRM='YES'; node scripts/restore-stock-max.mjs   # 반영 (PowerShell)
 */
import "dotenv/config";
import pg from "pg";

/** 코드 → 원래 누적 총 입고량 */
const ORIGINAL_STOCK_MAX = {
  "8809240182895": 14000, // 정성4호(개)
  "8809240182901": 8000, // 정성5호(개)
  "8809240181485": 3600, // 진3호(개)
  "8809240183250": 9600, // 특선1호(개)
};

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

async function main() {
  const apply = process.env.RESTORE_STOCK_MAX_CONFIRM === "YES";
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log("Target DB:", maskDbUrl(connectionString));
  console.log(apply ? "Mode: APPLY" : "Mode: DRY RUN (미리보기만)");

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();

  try {
    const codes = Object.keys(ORIGINAL_STOCK_MAX);
    const { rows } = await client.query(
      `SELECT "id", "code", "productName", "stock", "stockMax"
         FROM "stock_inventory" WHERE "code" = ANY($1) ORDER BY "id"`,
      [codes],
    );

    const missing = codes.filter((c) => !rows.some((r) => r.code === c));
    if (missing.length) {
      console.warn("DB에서 찾지 못한 코드:", missing.join(", "));
    }

    const targets = [];
    for (const r of rows) {
      const original = ORIGINAL_STOCK_MAX[r.code];
      if (r.stockMax !== null && r.stockMax >= original) {
        console.log(
          `  건너뜀 [${r.code}] ${r.productName}: 현재 분모 ${r.stockMax} (원래 ${original} 이상)`,
        );
        continue;
      }
      targets.push({ ...r, original });
      console.log(
        `  [${r.code}] ${r.productName}: ${r.stock}/${r.stockMax ?? "-"} → ${r.stock}/${original}`,
      );
    }

    console.log(`\n복구 대상: ${targets.length}건`);

    if (!apply) {
      console.log("반영하려면 RESTORE_STOCK_MAX_CONFIRM=YES 로 다시 실행하세요.");
      return;
    }

    await client.query("BEGIN");
    for (const t of targets) {
      await client.query(
        'UPDATE "stock_inventory" SET "stockMax" = $1 WHERE "id" = $2',
        [t.original, t.id],
      );
    }
    await client.query("COMMIT");
    console.log(`${targets.length}건 복구 완료.`);
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
