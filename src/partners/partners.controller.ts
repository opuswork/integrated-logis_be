import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUserPayload } from '../auth/jwt.strategy';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PartnersService } from './partners.service';

@ApiTags('partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  @ApiOperation({ summary: '내 거래처 목록 / 거래처명 검색' })
  findAll(
    @CurrentUser() user: AuthUserPayload,
    @Query('q') q?: string,
  ) {
    return this.partnersService.findAll(user.id, q);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '거래처 등록' })
  create(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreatePartnerDto,
  ) {
    return this.partnersService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '거래처 수정' })
  update(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partnersService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '거래처 삭제' })
  remove(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.partnersService.remove(user.id, id);
  }
}
