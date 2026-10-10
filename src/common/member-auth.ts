import * as bcrypt from 'bcrypt';

/** bcrypt cost factor (rounds) — matches generators set to 10 */
export const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  if (!passwordHash || !passwordHash.startsWith('$2')) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, '');
}

/** 휴대폰 번호(01X…)면 숫자만 돌려주고, 아니면 null */
export function mobilePhoneDigits(phone: string): string | null {
  const digits = normalizePhone(phone);
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

/**
 * 로그인 아이디: 휴대폰 가운데 자리 (010-4463-1440 → 4463).
 * 겹치는 회원이 있어 DB username 은 그대로 두고, 로그인할 때만 이 값으로 찾는다.
 */
export function loginIdFromPhone(phone: string): string | null {
  const digits = mobilePhoneDigits(phone);
  return digits ? digits.slice(3, -4) : null;
}

/**
 * 초기 비밀번호: 휴대폰 가운데 + 뒷자리 (010-4463-1440 → 44631440).
 * 휴대폰 인증 로그인이 붙기 전까지 쓰는 임시 규칙입니다.
 */
export function initialPasswordFromPhone(phone: string) {
  return normalizePhone(phone).slice(3);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function formatPhone(phone: string) {
  const digits = normalizePhone(phone).slice(0, 11);
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
