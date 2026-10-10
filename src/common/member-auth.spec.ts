import {
  initialPasswordFromPhone,
  loginIdFromPhone,
  mobilePhoneDigits,
} from './member-auth';

describe('휴대폰 기반 로그인 아이디 / 초기 비밀번호', () => {
  it('가운데 4자리가 아이디, 가운데+뒷자리가 비밀번호', () => {
    expect(loginIdFromPhone('010-4463-1440')).toBe('4463');
    expect(initialPasswordFromPhone('010-4463-1440')).toBe('44631440');
    expect(initialPasswordFromPhone('01044631440')).toBe('44631440');
  });

  it('10자리 번호는 가운데 3자리', () => {
    expect(loginIdFromPhone('011-123-4567')).toBe('123');
    expect(initialPasswordFromPhone('0111234567')).toBe('1234567');
  });

  it('휴대폰 번호가 아니면 아이디를 만들지 않는다', () => {
    expect(mobilePhoneDigits('02-123-4567')).toBeNull();
    expect(loginIdFromPhone('02-123-4567')).toBeNull();
  });
});
