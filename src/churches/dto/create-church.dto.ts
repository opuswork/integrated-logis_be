import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateChurchDto {
  @ApiProperty({ example: '서울5' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '서울' })
  @IsString()
  @IsNotEmpty()
  region!: string;

  @ApiPropertyOptional({ example: '5', nullable: true })
  @IsOptional()
  @IsString()
  branchCode?: string | null;

  @ApiProperty({ example: '이영심(총)' })
  @IsString()
  @IsNotEmpty()
  assigner!: string;
}
