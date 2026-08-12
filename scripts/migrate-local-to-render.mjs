/**
 * Copy data: local Docker Postgres → Render Postgres (schema already migrated).
 *
 * Usage (from be/):
 *   node scripts/migrate-local-to-render.mjs
 *
 * Requires Docker (sanc-logistics-db + postgres:15-alpine for psql client).
 * DATABASE_URL in .env must be Render External URL.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';

const DOCKER_DB = 'sanc-logistics-db';
const DUMP_PATH = resolve('scripts/_local_data_dump.sql');
const CLEAN_PATH = resolve('scripts/_local_data_dump.clean.sql');

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

function renderPsqlUrl(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.set('sslmode', 'require');
  return url.toString();
}

function dumpFromDocker() {
  console.log('1) Dumping data from Docker (COPY format)...');
  const sql = execFileSync(
    'docker',
    [
      'exec',
      DOCKER_DB,
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      'sanc_logistics',
      '--data-only',
      '--no-owner',
      '--no-acl',
      '--exclude-table=_prisma_migrations',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  writeFileSync(DUMP_PATH, sql, 'utf8');
  const cleaned = sql
    .split(/\r?\n/)
    .filter((line) => !/^\\(restrict|unrestrict)\b/.test(line))
    .join('\n');
  writeFileSync(CLEAN_PATH, cleaned, 'utf8');
  console.log(`   Dump ${sql.length} bytes → cleaned ${cleaned.length} bytes`);
}

async function counts(pool, label) {
  const q = `
    SELECT 'User' AS t, COUNT(*)::int AS n FROM "User"
    UNION ALL SELECT 'Church', COUNT(*)::int FROM "Church"
    UNION ALL SELECT 'Order', COUNT(*)::int FROM "Order"
    UNION ALL SELECT 'OrderItem', COUNT(*)::int FROM "OrderItem"
    UNION ALL SELECT 'Shipment', COUNT(*)::int FROM "Shipment"
    UNION ALL SELECT 'greeting_form', COUNT(*)::int FROM greeting_form
    UNION ALL SELECT 'stock_inventory', COUNT(*)::int FROM stock_inventory
    ORDER BY t`;
  const { rows } = await pool.query(q);
  console.log(`   [${label}]`);
  for (const row of rows) {
    console.log(`     ${row.t}: ${row.n}`);
  }
}

async function restoreToRender(connectionString) {
  console.log('2) Connecting to Render...');
  const pool = new pg.Pool({
    ...buildPoolConfig(connectionString),
    connectionTimeoutMillis: 30000,
  });

  let keepDump = false;
  try {
    await counts(pool, 'Render BEFORE');

    console.log('3) Truncating Render app tables...');
    await pool.query(`
      TRUNCATE TABLE
        "OrderItem",
        "Shipment",
        greeting_form,
        "Order",
        stock_inventory,
        "User",
        "Church"
      RESTART IDENTITY CASCADE;
    `);
    await pool.end();

    console.log('4) Loading dump via psql (postgres:15-alpine)...');
    const cleaned = readFileSync(CLEAN_PATH);
    const psqlUrl = renderPsqlUrl(connectionString);
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        'postgres:15-alpine',
        'psql',
        psqlUrl,
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        '-',
      ],
      {
        input: cleaned,
        stdio: ['pipe', 'inherit', 'inherit'],
        maxBuffer: 64 * 1024 * 1024,
      },
    );

    const verify = new pg.Pool({
      ...buildPoolConfig(connectionString),
      connectionTimeoutMillis: 30000,
    });
    try {
      console.log('5) Verifying...');
      await counts(verify, 'Render AFTER');
    } finally {
      await verify.end();
    }
  } catch (err) {
    keepDump = true;
    try {
      await pool.end();
    } catch {
      // already ended
    }
    throw err;
  } finally {
    if (!keepDump) {
      for (const p of [DUMP_PATH, CLEAN_PATH]) {
        try {
          unlinkSync(p);
        } catch {
          // ignore
        }
      }
    } else {
      console.error(`Dump kept: ${DUMP_PATH} / ${CLEAN_PATH}`);
    }
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in .env');
  }
  if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString)) {
    throw new Error(
      'DATABASE_URL points at localhost. Point .env at Render External URL first.',
    );
  }

  dumpFromDocker();
  await restoreToRender(connectionString);
  console.log('Done. Use credentials from the local DB (not the temporary Render-only admin seed).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
