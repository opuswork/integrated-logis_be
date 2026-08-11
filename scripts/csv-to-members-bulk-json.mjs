#!/usr/bin/env node
/**
 * Convert Excel-exported CSV to members-bulk.json for Swagger POST /api/members/bulk-import
 *
 * Usage:
 *   node scripts/csv-to-members-bulk-json.mjs seed/members.csv seed/members-bulk.json
 *
 * CSV columns (header row required):
 *   church,fullname,phone,username,password
 * or Korean headers:
 *   중앙,성명,phone,username,password
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const inputPath = resolve(process.argv[2] ?? 'seed/members.csv');
const outputPath = resolve(process.argv[3] ?? 'seed/members-bulk.json');

const raw = readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

if (lines.length < 2) {
  console.error('CSV must have a header row and at least one data row.');
  process.exit(1);
}

const header = splitCsvLine(lines[0]).map(normalizeHeader);
const churchIdx = findCol(header, ['church', 'churchname', '중앙']);
const fullnameIdx = findCol(header, ['fullname', '성명', 'name']);
const phoneIdx = findCol(header, ['phone', '연락처']);
const usernameIdx = findCol(header, ['username', '아이디']);
const passwordIdx = findCol(header, ['password', '비밀번호']);

if (
  churchIdx < 0 ||
  fullnameIdx < 0 ||
  phoneIdx < 0 ||
  usernameIdx < 0 ||
  passwordIdx < 0
) {
  console.error(
    'Required columns: church(중앙), fullname(성명), phone, username, password',
  );
  process.exit(1);
}

const members = [];

for (let i = 1; i < lines.length; i += 1) {
  const cols = splitCsvLine(lines[i]);
  if (cols.every((value) => !value.trim())) {
    continue;
  }

  const churchName = cols[churchIdx]?.trim();
  const fullname = cols[fullnameIdx]?.trim();
  const phone = cols[phoneIdx]?.trim();
  let username = cols[usernameIdx]?.trim();
  let password = cols[passwordIdx]?.trim();

  const phoneDigits = phone.replace(/\D/g, '');

  if (!username) {
    username = `user${phoneDigits}`;
  }
  if (!password) {
    password = `pass${phoneDigits}`;
  }

  if (!churchName || !fullname || !phone) {
    console.warn(`Skipping row ${i + 1}: missing required field`);
    continue;
  }

  members.push({
    churchName,
    fullname,
    phone,
    username: username.toLowerCase(),
    password,
  });
}

const payload = {
  createMissingChurches: true,
  skipExisting: true,
  members,
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${members.length} members to ${outputPath}`);

function normalizeHeader(value) {
  return value.trim().toLowerCase().replace(/\(.*?\)/g, '');
}

function findCol(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate.toLowerCase());
    if (idx >= 0) {
      return idx;
    }
  }
  return -1;
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current);
  return result;
}
