import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'name@example.com' })
  @IsString()
  @IsNotEmpty()
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: '인증번호는 6자리 숫자여야 합니다.' })
  code!: string;
}
