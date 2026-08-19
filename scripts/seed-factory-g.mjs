/**
 * Ensure Factory-G user (인사장완료 승인자).
 * username: 0102964708
 *
 * Usage: node scripts/seed-factory-g.mjs
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';

const USERNAME = '0102964708';
const DEFAULT_PASSWORD = process.env.SEED_FACTORY_G_PASS ?? 'factoryg1440';

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

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  try {
    const existing = await pool.query(
      `SELECT id, username, role FROM "User" WHERE username = $1`,
      [USERNAME],
    );

    if (existing.rowCount > 0) {
      await pool.query(
        `UPDATE "User"
         SET role = 'FACTORY',
             "canApproveGreeting" = true,
             "adminRegion" = NULL,
             "updatedAt" = NOW()
         WHERE username = $1`,
        [USERNAME],
      );
      console.log(`Updated Factory-G: ${USERNAME} (id=${existing.rows[0].id})`);
    } else {
      const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      const inserted = await pool.query(
        `INSERT INTO "User"
          (username, password, fullname, phone, role, "adminRegion", "canApproveGreeting", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'FACTORY', NULL, true, NOW(), NOW())
         RETURNING id, username, role`,
        [USERNAME, hash, '인사장담당', USERNAME],
      );
      console.log(`Created Factory-G:`, inserted.rows[0]);
      console.log(`Default password: ${DEFAULT_PASSWORD}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
