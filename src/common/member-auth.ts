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
