/**
 * Upsert default admin for hosted DB (Render).
 *
 * Usage (from be/):
 *   node scripts/seed-admin.mjs
 *
 * Reads DATABASE_URL from .env. Default credentials:
 *   username=admin  password=admin1440  (override with SEED_ADMIN_USER / SEED_ADMIN_PASS)
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';

const username = (process.env.SEED_ADMIN_USER ?? 'admin').trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASS ?? 'admin1440';
const fullname = process.env.SEED_ADMIN_NAME ?? '관리자';
const phone = process.env.SEED_ADMIN_PHONE ?? '010-0000-0000';

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
  const hash = await bcrypt.hash(password, 10);

  try {
    const existing = await pool.query(
      `SELECT id, username, role FROM "User" WHERE username = $1`,
      [username],
    );

    if (existing.rowCount > 0) {
      await pool.query(
        `UPDATE "User"
         SET password = $1, role = 'ADMIN', "adminRegion" = NULL, "updatedAt" = NOW()
         WHERE username = $2`,
        [hash, username],
      );
      console.log(`Updated admin user: ${username} (id=${existing.rows[0].id})`);
    } else {
      const inserted = await pool.query(
        `INSERT INTO "User" (username, password, fullname, phone, role, "adminRegion", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'ADMIN', NULL, NOW(), NOW())
         RETURNING id, username, role`,
        [username, hash, fullname, phone],
      );
      console.log(`Created admin user:`, inserted.rows[0]);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
