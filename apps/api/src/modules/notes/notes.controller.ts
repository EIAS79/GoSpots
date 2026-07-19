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
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PERMISSIONS } from '../../common/permissions';
import { CreateNoteDto, UpdateNoteDto } from './dto/notes.dto';
import { NotesService } from './notes.service';

@ApiTags('notes')
@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.NOTES_READ)
  list(
    @CurrentUser() user: JwtAccessPayload,
    @Query('archived') archived?: string,
  ) {
    return this.notes.list(user, archived === '1' || archived === 'true');
  }

  @Post()
  @RequirePermissions(PERMISSIONS.NOTES_WRITE)
  create(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateNoteDto) {
    return this.notes.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.NOTES_WRITE)
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.NOTES_WRITE)
  archive(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.notes.archive(user, id);
  }
}
