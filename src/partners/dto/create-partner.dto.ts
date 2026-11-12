import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePartnerDto {
  @ApiProperty({ example: '산촌식품' })
  @IsString()
  @IsNotEmpty({ message: '거래처명을 입력해 주세요.' })
  name!: string;

  @ApiPropertyOptional({ example: '은행', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @ApiPropertyOptional({ example: 'NH농협은행', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subCategory?: string | null;

  @ApiPropertyOptional({ example: '서울5', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  centerName?: string | null;

  @ApiProperty({ example: '홍길동' })
  @IsString()
  @IsNotEmpty({ message: '담당자명을 입력해 주세요.' })
  contactName!: string;

  /** 휴대폰·유선전화 중 하나는 필요하다 (서비스에서 검사) */
  @ApiPropertyOptional({ example: '010-1234-5678', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobile?: string | null;

  @ApiPropertyOptional({
    description: '유선전화',
    example: '02-123-4567',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiProperty({ example: '서울시 강남구 테헤란로 1' })
  @IsString()
  @IsNotEmpty({ message: '주소를 입력해 주세요.' })
  address!: string;

  @ApiPropertyOptional({ example: '3층 301호', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressDetail?: string | null;

  @ApiPropertyOptional({ example: 'partner@example.com', nullable: true })
  @IsOptional()
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email?: string | null;
}
