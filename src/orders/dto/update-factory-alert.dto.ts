import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateFactoryAlertDto {
  @ApiPropertyOptional({
    enum: ['assignment'],
    description:
      'set=assignment → 작업자·주문매장 변경 경고등. 미지정/없음 → factoryAlert 클리어',
  })
  @IsOptional()
  @IsIn(['assignment'])
  set?: 'assignment';
}
