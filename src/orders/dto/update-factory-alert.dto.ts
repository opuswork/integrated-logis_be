import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateFactoryAlertDto {
  @ApiPropertyOptional({
    enum: ['assignment', 'worker', 'storeRegion'],
    description:
      "set=worker → '작업자'변경 경고 / set=storeRegion → '주문매장'변경 경고 / assignment→worker와 동일. 미지정 → 클리어",
  })
  @IsOptional()
  @IsIn(['assignment', 'worker', 'storeRegion'])
  set?: 'assignment' | 'worker' | 'storeRegion';
}
