/**
 * 본사 전용 계정 만들기. 개인앱 고객사 검색에서 중서남부=본사 고객사만 본다.
 *
 * Usage (from be/):
 *   node scripts/create-hq-account.mjs
 *
 * DATABASE_URL 환경변수(또는 .env)의 DB를 쓴다.
 * - 4자리 ID: 기존 아이디, 그리고 어떤 회원의 휴대폰 가운데 4자리(4자리 로그인 ID)와도 겹치지 않는 번호를 고른다.
 * - 8자리 비밀번호: 임의로 만든다. ID·비밀번호는 이때 한 번만 출력되니 따로 보관한다.
 * 이미 본사 계정이 있으면 새로 만들지 않고 ID만 알려준다.
 */
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import pg from 'pg';

import { buildPoolConfig, dbHost } from './partner-import-utils.mjs';

const FULLNAME = '본사';
/** 휴대폰이 아닌 값이라 휴대폰 4자리 로그인 경로에 걸리지 않는다 */
const PHONE = '02-0000-0000';

/** 회원 4자리 로그인 ID: 휴대폰 가운데 4자리 (010-4463-1440 → 4463), member-auth.ts 와 같은 규칙 */
function loginIdFromPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return /^01[016789]\d{7,8}$/.test(digits) ? digits.slice(3, -4) : null;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL이 없습니다.');
  console.log(`DB host       : ${dbHost(connectionString)}`);

  const pool = new pg.Pool(buildPoolConfig(connectionString));
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT id, username FROM "User" WHERE "hqPartnerAccess" = true ORDER BY id',
    );
    if (existing.rows.length) {
      console.log(
        `본사 계정이 이미 있습니다: ID ${existing.rows.map((r) => r.username).join(', ')}`,
      );
      console.log('비밀번호를 잊었다면 관리자 화면에서 재설정하세요.');
      return;
    }

    const { rows: users } = await client.query('SELECT username, phone FROM "User"');
    const taken = new Set();
    for (const u of users) {
      taken.add(String(u.username).trim().toLowerCase());
      const id = loginIdFromPhone(u.phone);
      if (id) taken.add(id);
    }
    const free = [];
    for (let n = 1000; n <= 9999; n += 1) {
      if (!taken.has(String(n))) free.push(String(n));
    }
    if (!free.length) throw new Error('겹치지 않는 4자리 ID가 없습니다.');
    const username = free[randomInt(free.length)];
    const password = String(randomInt(10_000_000, 100_000_000)); // 8자리
    const hash = await bcrypt.hash(password, 10);

    await client.query(
      `INSERT INTO "User"
         (username, password, fullname, phone, role, account_source, "hqPartnerAccess", "updatedAt")
       VALUES ($1, $2, $3, $4, 'MEMBER', 'BULK_IMPORT', true, NOW())`,
      [username, hash, FULLNAME, PHONE],
    );
    console.log('본사 계정을 만들었습니다. 아래 값을 따로 보관하세요 (다시 출력되지 않습니다).');
    console.log(`  ID       : ${username}`);
    console.log(`  비밀번호 : ${password}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
