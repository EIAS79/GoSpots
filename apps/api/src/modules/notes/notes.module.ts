import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [AuditModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
