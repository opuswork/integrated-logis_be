import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** 회원명단 엑셀 한 행. 빈 칸(또는 생략)은 변경하지 않는다. */
export class BulkUpdateMemberRowDto {
  @ApiPropertyOptional({
    example: 2,
    description: '엑셀 행 번호 (결과 표시용)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rowNumber?: number;

  @ApiProperty({ example: '01030321440', description: '아이디 (수정 대상 키)' })
  @IsString()
  username!: string;

  @ApiPropertyOptional({ example: '이은미' })
  @IsOptional()
  @IsString()
  fullname?: string;

  @ApiPropertyOptional({ example: '서울17', description: '중앙 (Church.name)' })
  @IsOptional()
  @IsString()
  churchName?: string;

  @ApiPropertyOptional({
    example: '관장',
    description:
      '직분: 관장/일반/총무/사장/부사장/상무 (또는 GWANJANG 등 코드)',
  })
  @IsOptional()
  @IsString()
  memberType?: string;

  @ApiPropertyOptional({ example: '010-3032-1440' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class BulkUpdateMembersDto {
  @ApiProperty({ type: [BulkUpdateMemberRowDto] })
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateMemberRowDto)
  rows!: BulkUpdateMemberRowDto[];

  @ApiPropertyOptional({
    default: true,
    description: 'true면 저장하지 않고 변경 미리보기만 돌려준다.',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
