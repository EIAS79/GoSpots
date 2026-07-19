import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GuestChatStatus } from '@prisma/client';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import { GuestChatService } from './guest-chat.service';

class StaffChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

class StaffChatStatusDto {
  @IsIn(['OPEN', 'PAUSED', 'ENDED'])
  status!: 'OPEN' | 'PAUSED' | 'ENDED';
}

@ApiTags('guest-chats')
@Controller('guest-chats')
@UseGuards(JwtAuthGuard)
export class GuestChatController {
  constructor(private readonly chats: GuestChatService) {}

  @Get()
  list(
    @CurrentUser() user: JwtAccessPayload,
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const parsed =
      status === 'WAITING' ||
      status === 'OPEN' ||
      status === 'PAUSED' ||
      status === 'ENDED'
        ? (status as GuestChatStatus)
        : undefined;
    return this.chats.listForShop(user, {
      status: parsed,
      take: take ? +take : undefined,
      skip: skip ? +skip : undefined,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.chats.getForStaff(user, id);
  }

  @Post(':id/join')
  join(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.chats.staffJoin(user, id);
  }

  @Post(':id/messages')
  send(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: StaffChatMessageDto,
  ) {
    return this.chats.staffSendMessage(user, id, dto.body);
  }

  @Patch(':id')
  setStatus(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: StaffChatStatusDto,
  ) {
    return this.chats.staffSetStatus(
      user,
      id,
      dto.status as GuestChatStatus,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.chats.staffDelete(user, id);
  }
}
