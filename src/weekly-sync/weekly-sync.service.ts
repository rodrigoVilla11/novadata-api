import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WeeklyThread,
  WeeklyThreadDocument,
} from './schemas/weekly-thread.schema';
import {
  WeeklyMessage,
  WeeklyMessageDocument,
  WeeklyMessageType,
} from './schemas/weekly-message.schema';
import { CreateWeeklyMessageDto } from './dto/create-weekly-message.dto';
import { CloseWeekDto } from './dto/close-week.dto';
import { randomUUID } from 'crypto';
import { User, UserDocument } from 'src/users/schemas/user.schema';

type AuthUser = {
  id: string;
  roles?: string[];
  branchId?: string | null;
  email?: string | null;
};

function startOfWeekMonday(d: Date): Date {
  // Semana arrancando lunes 00:00 (timezone del server)
  const date = new Date(d);
  const day = date.getDay(); // 0=Dom,1=Lun...
  const diffToMonday = (day + 6) % 7; // Lun=0, Mar=1, ... Dom=6
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function requireManagerOrAdmin(user: AuthUser) {
  const roles = user?.roles || [];
  const ok = roles.includes('ADMIN') || roles.includes('MANAGER');
  if (!ok)
    throw new ForbiddenException('No tenés permisos para usar Weekly Sync.');
}

function requireBranchId(user: AuthUser): string {
  const branchId = user?.branchId ?? null;
  if (!branchId) {
    throw new ForbiddenException('Tu usuario no tiene branchId asignado.');
  }
  return String(branchId);
}

@Injectable()
export class WeeklySyncService {
  constructor(
    @InjectModel(WeeklyThread.name)
    private readonly threadModel: Model<WeeklyThreadDocument>,
    @InjectModel(WeeklyMessage.name)
    private readonly messageModel: Model<WeeklyMessageDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async getOrCreateCurrentWeek(user: AuthUser) {
    requireManagerOrAdmin(user);
    const branchId = requireBranchId(user);

    const week_start = startOfWeekMonday(new Date());
    const week_end = addDays(week_start, 7); // lunes siguiente 00:00

    // ✅ Multi-branch: buscar por branchId + week_start
    let thread = await this.threadModel
      .findOne({ branchId, week_start })
      .lean();

    if (!thread) {
      try {
        const created = await this.threadModel.create({
          id: randomUUID(),
          branchId,
          week_start,
          week_end,
          status: 'open',
          created_by: user.id,
          participants: [],
          summary: '',
        });

        thread = created.toObject();

        // Mensaje inicial plantilla (opcional pero recomendado)
        await this.messageModel.create({
          id: randomUUID(),
          branchId,
          thread_id: thread.id,
          author_id: user.id,
          author_email: user.email ?? null,
          type: 'otro',
          pinned: true,
          task_id: null,
          text:
            '📌 Plantilla semanal\n' +
            '✅ Avances:\n' +
            '⚠️ Errores / incidentes:\n' +
            '🔧 Cosas a mejorar:\n' +
            '🧱 Bloqueos:\n' +
            '🎯 Objetivos de la semana:\n' +
            '📌 Acciones / responsables:\n',
        });
      } catch (e: any) {
        // carrera: dos usuarios entran a la vez → unique (branchId, week_start)
        thread = await this.threadModel
          .findOne({ branchId, week_start })
          .lean();
      }
    }

    return thread;
  }

  async listWeeks(user: AuthUser, limit = 20) {
    requireManagerOrAdmin(user);
    const branchId = requireBranchId(user);

    return this.threadModel
      .find({ branchId })
      .sort({ week_start: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();
  }

  async listMessages(
    user: AuthUser,
    threadId: string,
    opts?: { limit?: number; cursor?: string },
  ) {
    requireManagerOrAdmin(user);
    const branchId = requireBranchId(user);

    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    const cursor = opts?.cursor; // createdAt ISO string

    const thread = await this.threadModel.findOne({ id: threadId }).lean();
    if (!thread) throw new NotFoundException('Semana no encontrada.');

    // ✅ Aislamiento por sucursal
    if (String((thread as any).branchId) !== branchId) {
      throw new ForbiddenException('No tenés acceso a esta semana.');
    }

    const query: any = { branchId, thread_id: threadId };

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!isFinite(cursorDate.getTime()))
        throw new BadRequestException('Cursor inválido.');
      query.createdAt = { $lt: cursorDate };
    }

    const items = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const nextCursor = items.length
      ? items[items.length - 1].createdAt?.toISOString?.()
      : null;

    return { items, nextCursor };
  }

  async createMessage(
    user: AuthUser,
    threadId: string,
    dto: CreateWeeklyMessageDto,
  ) {
    requireManagerOrAdmin(user);
    const branchId = requireBranchId(user);

    const thread = await this.threadModel.findOne({ id: threadId }).lean();
    if (!thread) throw new NotFoundException('Semana no encontrada.');

    // ✅ Aislamiento por sucursal
    if (String((thread as any).branchId) !== branchId) {
      throw new ForbiddenException('No tenés acceso a esta semana.');
    }

    if ((thread as any).status === 'closed')
      throw new BadRequestException('La semana está cerrada.');

    const type: WeeklyMessageType = (dto.type ?? 'otro') as WeeklyMessageType;

    const created = await this.messageModel.create({
      id: randomUUID(),
      branchId,
      thread_id: threadId,
      author_id: user.id,
      author_email: user.email ?? null,
      type,
      text: dto.text,
      pinned: dto.pinned ?? false,
      task_id: dto.task_id ?? null,
    });

    // Si querés garantizar email aunque no venga en req.user:
    const author = await this.userModel
      .findOne({ id: user.id }, { email: 1 })
      .lean();

    return {
      ...created.toObject(),
      author_email: author?.email || user.email || null,
    };
  }

  async closeWeek(user: AuthUser, threadId: string, dto: CloseWeekDto) {
    requireManagerOrAdmin(user);
    const branchId = requireBranchId(user);

    const thread = await this.threadModel.findOne({ id: threadId });
    if (!thread) throw new NotFoundException('Semana no encontrada.');

    // ✅ Aislamiento por sucursal
    if (String((thread as any).branchId) !== branchId) {
      throw new ForbiddenException('No tenés acceso a esta semana.');
    }

    if ((thread as any).status === 'closed') return thread.toObject();

    (thread as any).status = 'closed';
    if (typeof dto.summary === 'string') (thread as any).summary = dto.summary;

    await thread.save();
    return thread.toObject();
  }
}
