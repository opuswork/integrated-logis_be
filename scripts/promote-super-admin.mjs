/**
 * Promote an existing user to super admin (최고관리자): role=ADMIN, adminRegion=NULL.
 * Password and other fields are left untouched.
 *
 * Usage (from be/):
 *   node scripts/promote-super-admin.mjs [username]
 *
 * Reads DATABASE_URL from .env. Default username: 01044631440 (system administrator).
 */
import 'dotenv/config';
import pg from 'pg';

const username = (process.argv[2] ?? '01044631440').trim();

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
  console.log(`DB host: ${new URL(connectionString).hostname}`);

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  try {
    const before = await pool.query(
      `SELECT id, username, fullname, role, "adminRegion" FROM "User" WHERE username = $1`,
      [username],
    );
    if (before.rowCount === 0) {
      throw new Error(`User not found: ${username}`);
    }
    console.log('Before:', before.rows[0]);

    const after = await pool.query(
      `UPDATE "User"
       SET role = 'ADMIN', "adminRegion" = NULL, "updatedAt" = NOW()
       WHERE username = $1
       RETURNING id, username, fullname, role, "adminRegion"`,
      [username],
    );
    console.log('After: ', after.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
