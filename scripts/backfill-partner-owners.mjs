/**
 * 거래처 소유자 칸(ownerName / ownerRegion)을 담당자·중앙 값으로 다시 계산해 채운다.
 * 개인앱 고객사 검색은 이 칸으로 "내 고객사"만 보여준다.
 *
 * Usage (from be/):
 *   node scripts/backfill-partner-owners.mjs [--dry-run]
 *
 * DATABASE_URL 환경변수(또는 .env)의 DB를 쓴다. 행을 지우지 않고, 여러 번 실행해도 결과가 같다.
 * --dry-run 은 계산 결과만 보여주고 되돌린다.
 */
import 'dotenv/config';
import pg from 'pg';

import { backfillPartnerOwners, buildPoolConfig, dbHost } from './partner-import-utils.mjs';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL이 없습니다.');
  console.log(`DB host       : ${dbHost(connectionString)}`);

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stats = await backfillPartnerOwners(client);
    console.log(`거래처 전체   : ${stats.total}`);
    console.log(`사람 담당자   : ${stats.person}건 (${stats.people}명)`);
    console.log(`지역 담당자   : ${stats.region}건`);
    console.log(`소유자 없음   : ${stats.none}건 (본사·직접 등록 등)`);
    console.log(`바뀐 행       : ${stats.changed}`);
    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('--dry-run: 되돌렸습니다.');
    } else {
      await client.query('COMMIT');
      console.log('저장했습니다.');
    }
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
