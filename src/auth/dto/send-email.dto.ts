import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SendEmailDto {
  @ApiProperty({ example: 'name@example.com' })
  @IsString()
  @IsNotEmpty()
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email!: string;
}
