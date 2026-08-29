import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUserPayload } from '../auth/jwt.strategy';
import { CreateMemberDto } from './dto/create-member.dto';
import { BulkImportMembersDto } from './dto/bulk-import.dto';
import {
  MemberByUsernameResponseDto,
  MembersListResponseDto,
} from './dto/member-response.dto';
import { PutMemberDto, UpdateMemberDto } from './dto/update-member.dto';
import { MembersService } from './members.service';

@ApiTags('members')
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '회원가입' })
  create(@Body() createMemberDto: CreateMemberDto) {
    return this.membersService.create(createMemberDto);
  }

  @Post('bulk-import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '회원 일괄 등록 (Excel → JSON)',
    description:
      'churchName(중앙), fullname, phone, username, password 배열을 한 번에 등록합니다. 교회가 없으면 자동 생성합니다.',
  })
  bulkImport(@Body() dto: BulkImportMembersDto) {
    return this.membersService.bulkImport(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '회원 목록 조회 (관리자 JWT)',
    description: '비밀번호를 제외한 회원 목록을 반환합니다.',
  })
  @ApiOkResponse({ type: MembersListResponseDto })
  findAll(@CurrentUser() user: AuthUserPayload) {
    return this.membersService.findAll(user);
  }

  @Get('check-username')
  @ApiOperation({ summary: '아이디 중복 확인' })
  checkUsername(@Query('username') username: string) {
    return this.membersService.checkUsername(username);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '회원 이름 부분검색 (관리자 JWT)',
    description:
      '주문서 주문자 자동완성용. 이름 부분일치 회원을 최대 10명 반환합니다.',
  })
  search(@Query('q') q: string, @CurrentUser() user: AuthUserPayload) {
    return this.membersService.searchByName(q ?? '', user);
  }

  @Get(':username')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '회원 단건 조회 (관리자 JWT)',
    description: 'username으로 회원을 조회합니다. 비밀번호는 제외됩니다.',
  })
  @ApiParam({
    name: 'username',
    example: 'hong01',
    description: '회원 아이디',
  })
  @ApiOkResponse({ type: MemberByUsernameResponseDto })
  findByUsername(
    @Param('username') username: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.membersService.findByUsername(username, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '회원 정보 부분 수정 (JWT)',
    description:
      'phone / password / fullname / email / churchId 중 변경할 필드만 전송. password는 평문 → bcrypt(cost 10) 저장.',
  })
  updatePartial(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMemberDto: UpdateMemberDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.membersService.updatePartial(id, updateMemberDto, user);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '회원 정보 전체 교체 (JWT)',
    description:
      'fullname, phone, password 필수. password는 평문 → bcrypt(cost 10) 저장.',
  })
  replace(
    @Param('id', ParseIntPipe) id: number,
    @Body() putMemberDto: PutMemberDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.membersService.replace(id, putMemberDto, user);
  }
}
