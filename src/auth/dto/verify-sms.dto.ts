import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifySmsDto {
  @ApiProperty({ example: '010-1234-5678' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: '인증번호는 6자리 숫자여야 합니다.' })
  code!: string;
}
