import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePartnerDto {
  @ApiProperty({ example: '산촌식품' })
  @IsString()
  @IsNotEmpty({ message: '거래처명을 입력해 주세요.' })
  name!: string;

  @ApiProperty({ example: '홍길동' })
  @IsString()
  @IsNotEmpty({ message: '담당자명을 입력해 주세요.' })
  contactName!: string;

  @ApiProperty({ example: '010-1234-5678' })
  @IsString()
  @IsNotEmpty({ message: '연락처를 입력해 주세요.' })
  phone!: string;

  @ApiProperty({ example: '서울시 강남구 테헤란로 1' })
  @IsString()
  @IsNotEmpty({ message: '주소를 입력해 주세요.' })
  address!: string;

  @ApiPropertyOptional({ example: 'partner@example.com', nullable: true })
  @IsOptional()
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email?: string | null;
}
