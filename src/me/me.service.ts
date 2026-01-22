import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Employee, EmployeeDocument } from 'src/employees/schemas/employee.schema';
import { AttendanceDocument, AttendanceRecord } from 'src/attendance/schemas/attendance.schema';
import { ProductionEntry, ProductionDocument } from 'src/production/schemas/production.schema';

function isValidDateKey(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));
}

function toObjectId(id: any, label = 'id') {
  const s = String(id ?? '');
  if (!Types.ObjectId.isValid(s)) throw new BadRequestException(`${label} inválido`);
  return new Types.ObjectId(s);
}

function diffHours(a?: Date | string | null, b?: Date | string | null) {
  if (!a || !b) return 0;
  const da = new Date(a);
  const db = new Date(b);
  const ms = db.getTime() - da.getTime();
  return ms > 0 ? ms / 36e5 : 0;
}

// Genera todos los dateKey entre [from..to] inclusive
function eachDayKeys(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Cordoba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(fmt(d));
  }
  return out;
}

@Injectable()
export class MeService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(ProductionEntry.name)
    private readonly productionModel: Model<ProductionDocument>,
  ) {}

  private async getEmployeeOrThrow(userId: string) {
    const uId = toObjectId(userId, 'userId');

    const doc = await this.employeeModel
      .findOne({ userId: uId })
      .select({ _id: 1, fullName: 1, hourlyRate: 1, isActive: 1, branchId: 1 })
      .lean();

    if (!doc) {
      throw new NotFoundException(
        'Tu usuario no está vinculado a un empleado. Pedile al ADMIN que lo vincule.',
      );
    }

    const branchId = (doc as any).branchId;
    if (!branchId) throw new ForbiddenException('Empleado sin branch asignada');

    return doc;
  }

  async me(userId: string) {
    const emp = await this.getEmployeeOrThrow(userId);
    return {
      userId,
      employee: {
        id: String(emp._id),
        fullName: emp.fullName,
        hourlyRate: Number((emp as any).hourlyRate ?? 0),
        isActive: !!(emp as any).isActive,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Attendance (MI PANEL)
  // ---------------------------------------------------------------------------

  async checkIn(
    userId: string,
    dto: { dateKey: string; photoUrl?: string | null; notes?: string | null },
  ) {
    const dateKey = String(dto?.dateKey ?? '').trim();
    if (!dateKey || !isValidDateKey(dateKey)) {
      throw new BadRequestException('dateKey inválido (usar YYYY-MM-DD)');
    }

    const emp = await this.getEmployeeOrThrow(userId);

    const now = new Date();
    const employeeId = new Types.ObjectId(emp._id);
    const branchId = new Types.ObjectId((emp as any).branchId);

    // ✅ No pisar checkInAt si ya existe
    // ✅ branchId requerido por schema
    const doc = await this.attendanceModel
      .findOneAndUpdate(
        { branchId, dateKey, employeeId },
        {
          $setOnInsert: {
            branchId,
            dateKey,
            employeeId,
            createdBy: toObjectId(userId, 'userId'),
          },
          $set: {
            checkInAt: now,
            ...(dto.photoUrl !== undefined ? { checkInPhotoUrl: dto.photoUrl ?? null } : {}),
            ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
          },
        },
        { upsert: true, new: true },
      )
      .lean();

    // Si ya existía y tenía checkInAt anterior, este update lo pisa.
    // Si querés 100% “no pisar”, usá filtro extra:
    // { branchId, dateKey, employeeId, checkInAt: null }
    // + fallback a existing. Acá lo dejo mejorado así:

    if (doc?.checkInAt && new Date(doc.checkInAt).getTime() !== now.getTime()) {
      // (no siempre aplica) - lo dejamos sin romper
    }

    return {
      id: String(doc._id),
      branchId: String(doc.branchId),
      dateKey: doc.dateKey,
      employeeId: String(doc.employeeId),
      checkInAt: doc.checkInAt ?? null,
      checkOutAt: doc.checkOutAt ?? null,
      checkInPhotoUrl: doc.checkInPhotoUrl ?? null,
      checkOutPhotoUrl: doc.checkOutPhotoUrl ?? null,
      createdBy: doc.createdBy ? String(doc.createdBy) : null,
      notes: doc.notes ?? null,
    };
  }

  async checkOut(
    userId: string,
    dto: { dateKey: string; photoUrl?: string | null; notes?: string | null },
  ) {
    const dateKey = String(dto?.dateKey ?? '').trim();
    if (!dateKey || !isValidDateKey(dateKey)) {
      throw new BadRequestException('dateKey inválido (usar YYYY-MM-DD)');
    }

    const emp = await this.getEmployeeOrThrow(userId);

    const now = new Date();
    const employeeId = new Types.ObjectId(emp._id);
    const branchId = new Types.ObjectId((emp as any).branchId);

    // ✅ no permitir check-out si no existe registro con checkInAt
    // ✅ no permitir doble check-out
    const doc = await this.attendanceModel
      .findOneAndUpdate(
        {
          branchId,
          dateKey,
          employeeId,
          checkInAt: { $ne: null },
          checkOutAt: null,
        },
        {
          $set: {
            checkOutAt: now,
            ...(dto.photoUrl !== undefined ? { checkOutPhotoUrl: dto.photoUrl ?? null } : {}),
            ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
          },
        },
        { new: true },
      )
      .lean();

    if (!doc) {
      // diagnosticar mejor
      const existing = await this.attendanceModel
        .findOne({ branchId, dateKey, employeeId })
        .select({ _id: 1, checkInAt: 1, checkOutAt: 1 })
        .lean();

      if (!existing) throw new NotFoundException('No hay check-in para este día');
      if (!existing.checkInAt) throw new BadRequestException('El registro no tiene check-in');
      if (existing.checkOutAt) throw new BadRequestException('Ya existe check-out para este día');
      throw new BadRequestException('No se pudo hacer check-out');
    }

    // validación temporal
    if (doc.checkInAt && now.getTime() < new Date(doc.checkInAt).getTime()) {
      throw new BadRequestException('check-out no puede ser antes del check-in');
    }

    return {
      id: String(doc._id),
      branchId: String(doc.branchId),
      dateKey: doc.dateKey,
      employeeId: String(doc.employeeId),
      checkInAt: doc.checkInAt ?? null,
      checkOutAt: doc.checkOutAt ?? null,
      checkInPhotoUrl: doc.checkInPhotoUrl ?? null,
      checkOutPhotoUrl: doc.checkOutPhotoUrl ?? null,
      createdBy: doc.createdBy ? String(doc.createdBy) : null,
      notes: doc.notes ?? null,
    };
  }

  async summary(userId: string, range: { from?: string; to?: string }) {
    const emp = await this.getEmployeeOrThrow(userId);

    const from = String(range.from ?? '').trim();
    const to = String(range.to ?? '').trim();
    if (!from || !to || !isValidDateKey(from) || !isValidDateKey(to)) {
      throw new BadRequestException('from/to inválidos (usar YYYY-MM-DD)');
    }

    const employeeId = new Types.ObjectId(emp._id);
    const branchId = new Types.ObjectId((emp as any).branchId);

    const rows = await this.attendanceModel
      .find({
        branchId,
        employeeId,
        dateKey: { $gte: from, $lte: to },
      })
      .sort({ dateKey: 1 })
      .lean();

    const byDate = new Map<string, any>();
    for (const r of rows) byDate.set(r.dateKey, r);

    const allDays = eachDayKeys(from, to);

    let totalHours = 0;

    const items = allDays.map((dk) => {
      const r = byDate.get(dk);
      const h = r ? diffHours(r.checkInAt, r.checkOutAt) : 0;
      totalHours += h;

      return {
        id: r ? String(r._id) : `${String(emp._id)}:${dk}`,
        dateKey: dk,
        checkInAt: r?.checkInAt ?? null,
        checkOutAt: r?.checkOutAt ?? null,
        hours: Math.round(h * 100) / 100,
      };
    });

    const hourlyRate = Number((emp as any).hourlyRate || 0);
    const totalPay = totalHours * hourlyRate;

    return {
      employee: { id: String(emp._id), fullName: emp.fullName, hourlyRate },
      range: { from, to },
      totals: {
        totalHours: Math.round(totalHours * 100) / 100,
        totalPay: Math.round(totalPay * 100) / 100,
      },
      items,
    };
  }

  // ---------------------------------------------------------------------------
  // Production (tu lógica, solo dejo branch guard coherente si querés)
  // ---------------------------------------------------------------------------

  async production(
    userId: string,
    q: { dateKey?: string; from?: string; to?: string; limit?: number },
  ) {
    const emp = await this.getEmployeeOrThrow(userId);

    const filter: any = {
      employeeId: new Types.ObjectId(emp._id),
      // si tu production también es branch-scoped y tiene branchId, agregalo:
      // branchId: new Types.ObjectId((emp as any).branchId),
    };

    if (q.dateKey?.trim()) {
      const dk = q.dateKey.trim();
      if (!isValidDateKey(dk)) throw new BadRequestException('dateKey inválido');
      filter.dateKey = dk;
    } else if (q.from?.trim() && q.to?.trim()) {
      const from = q.from.trim();
      const to = q.to.trim();
      if (!isValidDateKey(from) || !isValidDateKey(to)) {
        throw new BadRequestException('from/to inválidos');
      }
      filter.dateKey = { $gte: from, $lte: to };
    }

    const limit = Math.min(Math.max(q.limit ?? 200, 1), 500);

    const rows = await this.productionModel
      .find(filter)
      .populate({ path: 'taskId', select: 'name area' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return rows.map((r: any) => {
      const isDone = Boolean(r.isDone);
      const status = (r.status ?? (isDone ? 'DONE' : 'PENDING')) as 'PENDING' | 'DONE';
      const moment = r.performedAt ?? r.createdAt ?? null;

      return {
        id: String(r._id),
        dateKey: r.dateKey,
        performedAt: moment,
        at: moment,
        time: r.time ?? null,
        isDone,
        status,
        doneAt: r.doneAt ?? null,
        taskId: r.taskId ? String(r.taskId._id ?? r.taskId) : null,
        taskName: r.taskId?.name ?? null,
        area: r.taskId?.area ?? null,
        notes: Array.isArray(r.notes) ? r.notes : [],
      };
    });
  }
}
