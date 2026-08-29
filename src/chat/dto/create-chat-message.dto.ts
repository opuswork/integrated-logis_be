import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChatMessageDto {
  @ApiProperty({ example: '남부 출고 건 확인 부탁드립니다.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}
