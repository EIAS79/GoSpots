import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ContactMessagesService } from './contact.service';

@ApiTags('contact')
@Controller('contact-messages')
@UseGuards(JwtAuthGuard)
export class ContactMessagesController {
  constructor(private readonly contact: ContactMessagesService) {}

  @Get()
  list(
    @CurrentUser() user: JwtAccessPayload,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.contact.listForShop(user, {
      take: take ? +take : undefined,
      skip: skip ? +skip : undefined,
    });
  }
}
