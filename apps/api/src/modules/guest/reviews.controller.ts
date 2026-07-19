import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VenueReviewStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import { UpdateReviewStatusDto } from './dto/guest.dto';
import { VenueReviewsService } from './venue-reviews.service';

@ApiTags('reviews')
@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class VenueReviewsController {
  constructor(private readonly reviews: VenueReviewsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtAccessPayload,
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const parsed =
      status === 'PENDING' || status === 'PUBLISHED' || status === 'REJECTED'
        ? (status as VenueReviewStatus)
        : undefined;
    return this.reviews.listForShop(user, {
      status: parsed,
      take: take ? +take : undefined,
      skip: skip ? +skip : undefined,
    });
  }

  @Patch(':id')
  updateStatus(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviews.updateStatus(
      user,
      id,
      dto.status as VenueReviewStatus,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.reviews.remove(user, id);
  }
}
