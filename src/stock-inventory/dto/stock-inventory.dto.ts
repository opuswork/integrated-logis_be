import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  return Number(String(value).replace(/,/g, '').trim());
}

function toInt(value: unknown): number {
  if (typeof value === 'number') {
    return Math.trunc(value);
  }
  return Number.parseInt(String(value).replace(/,/g, '').trim(), 10);
}

/** Missing → undefined (PATCH omit). Empty → null (unlimited). Otherwise count. */
function toOptionalStock(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'null') {
      return null;
    }
    const n = Number.parseInt(trimmed.replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value === 'on';
  }
  return Boolean(value);
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return toBoolean(value);
}

export class CreateStockInventoryDto {
  @ApiProperty({ example: '8809240150143', description: '코드' })
  @IsString()
  code!: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/products/soy.png',
    description: '사진 URL/경로 (파일 업로드 시 생략)',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: '1급진간장 1.8L (개)', description: '품명' })
  @IsString()
  productName!: string;

  @ApiPropertyOptional({ example: '1.8L(개)', description: '규격' })
  @IsOptional()
  @IsString()
  spec?: string;

  @ApiProperty({ example: 1, description: '판매 단위' })
  @Transform(({ value }) => toInt(value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unit!: number;

  @ApiPropertyOptional({
    example: 100,
    nullable: true,
    description: '창고 재고 수량 (비우면/null = 무제한, 통계용)',
  })
  @Transform(({ value }) => toOptionalStock(value))
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(0)
  stock?: number | null;

  @ApiPropertyOptional({
    example: 30000,
    nullable: true,
    description: '기준/최대 재고 (UI에서 현재/최대로 표시, 비우면 현재수량만)',
  })
  @Transform(({ value }) => toOptionalStock(value))
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(0)
  stockMax?: number | null;

  @ApiProperty({
    example: '2026-01-01',
    description: '적용일자 (YYYY-MM-DD 또는 ISO)',
  })
  @IsDateString()
  effectiveDate!: string;

  @ApiProperty({ example: 7980, description: '500만원이상 할인가' })
  @Transform(({ value }) => toNumber(value))
  @Type(() => Number)
  @IsNumber()
  priceOver500man!: number;

  @ApiProperty({ example: 8150, description: '100만원이상 할인가' })
  @Transform(({ value }) => toNumber(value))
  @Type(() => Number)
  @IsNumber()
  priceOver100man!: number;

  @ApiProperty({ example: 8400, description: '도매 기본적용가격' })
  @Transform(({ value }) => toNumber(value))
  @Type(() => Number)
  @IsNumber()
  wholesalePrice!: number;

  @ApiProperty({ example: 8900, description: '준회원가' })
  @Transform(({ value }) => toNumber(value))
  @Type(() => Number)
  @IsNumber()
  associatePrice!: number;

  @ApiProperty({ example: '일반품', description: '구분 (선물세트/일반품)' })
  @IsString()
  category!: string;

  @ApiPropertyOptional({
    example: true,
    description: '고객 공개 여부 (true면 고객 주문 화면에 표시)',
    default: true,
  })
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  openStock?: boolean;
}

export class UpdateStockInventoryDto extends PartialType(
  CreateStockInventoryDto,
) {}

export class ReplaceStockInventoryDto extends CreateStockInventoryDto {}
