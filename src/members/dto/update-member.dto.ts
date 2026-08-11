import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

/** PATCH — send only fields to change (plain password; server bcrypt-hashes it). */
export class UpdateMemberDto {
  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullname?: string;

  @ApiPropertyOptional({ example: '010-1234-5678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'hong@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({
    example: 'newPassword123',
    description: 'Plain password. Server stores bcrypt hash (cost 10).',
  })
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @ApiPropertyOptional({
    example: 1,
    description: '소속 교회 ID. null이면 교회 연결 해제.',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  churchId?: number | null;

  @ApiPropertyOptional({
    enum: ['MEMBER', 'ADMIN', 'FACTORY'],
    description: '관리자만 변경 가능. MEMBER | ADMIN | FACTORY',
  })
  @IsOptional()
  @IsString()
  @IsIn(['MEMBER', 'ADMIN', 'FACTORY'])
  role?: 'MEMBER' | 'ADMIN' | 'FACTORY';

  @ApiPropertyOptional({
    enum: ['JUNGBU', 'NAMBU', 'SEOBU'],
    description:
      '지역 서브 관리자. role=ADMIN일 때 필수(JUNGBU|NAMBU|SEOBU). MEMBER/FACTORY면 서버에서 null 처리.',
    nullable: true,
  })
  @IsOptional()
  @IsIn(['JUNGBU', 'NAMBU', 'SEOBU'])
  adminRegion?: 'JUNGBU' | 'NAMBU' | 'SEOBU' | null;
}

/** PUT — replace profile fields. Password is plain text; server bcrypt-hashes it. */
export class PutMemberDto {
  @ApiProperty({ example: '홍길동' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  fullname!: string;

  @ApiProperty({ example: '010-1234-5678' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ example: 'hong@example.com', nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({
    example: 'newPassword123',
    description: 'Plain password. Server stores bcrypt hash (cost 10).',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  password!: string;
}
