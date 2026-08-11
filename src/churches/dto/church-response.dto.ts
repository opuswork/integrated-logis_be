import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChurchDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '서울5' })
  name!: string;

  @ApiProperty({ example: '서울' })
  region!: string;

  @ApiPropertyOptional({ example: '5', nullable: true })
  branchCode!: string | null;

  @ApiProperty({ example: '이영심(총)' })
  assigner!: string;

  @ApiProperty({ example: '2026-01-10T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-10T00:00:00.000Z' })
  updatedAt!: Date;
}
