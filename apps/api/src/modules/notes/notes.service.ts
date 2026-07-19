import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NoteImportance } from '@prisma/client';
import { hasPermission, PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import type { JwtAccessPayload } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/notes.dto';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assert(actor: JwtAccessPayload, perm: string) {
    if (!actor.shopId) throw new ForbiddenException();
    if (actor.shopRole === 'OWNER') return;
    if (
      hasPermission(
        actor.perms ?? '',
        perm as (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
      )
    ) {
      return;
    }
    throw new ForbiddenException(`Missing ${perm}`);
  }

  private async resolveAuthor(actor: JwtAccessPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { name: true, email: true, staffHandle: true },
    });
    const role = actor.shopRole ?? 'STAFF';
    const authorName =
      user?.name?.trim() ||
      user?.staffHandle?.trim() ||
      user?.email?.split('@')[0] ||
      'Team member';
    return { authorName, authorRole: role };
  }

  private mapNote(n: {
    id: string;
    title: string;
    body: string;
    importance: NoteImportance;
    relevantAt: Date;
    createdById: string | null;
    authorName: string;
    authorRole: string;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      importance: n.importance,
      relevantAt: n.relevantAt.toISOString(),
      createdById: n.createdById,
      authorName: n.authorName,
      authorRole: n.authorRole,
      archived: !!n.archivedAt,
      archivedAt: n.archivedAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    };
  }

  async list(actor: JwtAccessPayload, includeArchived = false) {
    this.assert(actor, PERMISSIONS.NOTES_READ);
    const shopId = requireShopId(actor);
    const notes = await this.prisma.shopNote.findMany({
      where: {
        shopId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ relevantAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return {
      notes: notes.map((n) => this.mapNote(n)),
      canWrite:
        actor.shopRole === 'OWNER' ||
        hasPermission(actor.perms ?? '', PERMISSIONS.NOTES_WRITE),
    };
  }

  async create(actor: JwtAccessPayload, dto: CreateNoteDto) {
    this.assert(actor, PERMISSIONS.NOTES_WRITE);
    const shopId = requireShopId(actor);
    const resolved = await this.resolveAuthor(actor);
    const authorName = dto.authorName?.trim() || resolved.authorName;
    const authorRole = resolved.authorRole;
    const importance = (dto.importance ?? 'NORMAL') as NoteImportance;
    const relevantAt = dto.relevantAt ? new Date(dto.relevantAt) : new Date();

    const note = await this.prisma.shopNote.create({
      data: {
        shopId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        importance,
        relevantAt,
        createdById: actor.sub,
        authorName,
        authorRole,
      },
    });

    await this.audit.record(actor, {
      section: 'notes',
      action: 'notes.create',
      summary: `Posted shift note: ${note.title}`,
      meta: { noteId: note.id, importance: note.importance },
    });

    return this.mapNote(note);
  }

  async update(actor: JwtAccessPayload, id: string, dto: UpdateNoteDto) {
    this.assert(actor, PERMISSIONS.NOTES_WRITE);
    const shopId = requireShopId(actor);
    const existing = await this.prisma.shopNote.findFirst({
      where: { id, shopId, archivedAt: null },
    });
    if (!existing) throw new NotFoundException('Note not found.');

    const note = await this.prisma.shopNote.update({
      where: { id },
      data: {
        ...(dto.title != null && { title: dto.title.trim() }),
        ...(dto.body != null && { body: dto.body.trim() }),
        ...(dto.importance != null && {
          importance: dto.importance as NoteImportance,
        }),
        ...(dto.relevantAt != null && {
          relevantAt: new Date(dto.relevantAt),
        }),
      },
    });

    await this.audit.record(actor, {
      section: 'notes',
      action: 'notes.update',
      summary: `Updated shift note: ${note.title}`,
      meta: { noteId: note.id },
    });

    return this.mapNote(note);
  }

  async archive(actor: JwtAccessPayload, id: string) {
    this.assert(actor, PERMISSIONS.NOTES_WRITE);
    const shopId = requireShopId(actor);
    const existing = await this.prisma.shopNote.findFirst({
      where: { id, shopId, archivedAt: null },
    });
    if (!existing) throw new NotFoundException('Note not found.');

    const note = await this.prisma.shopNote.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    await this.audit.record(actor, {
      section: 'notes',
      action: 'notes.archive',
      summary: `Archived shift note: ${note.title}`,
      meta: { noteId: note.id },
    });

    return this.mapNote(note);
  }
}
