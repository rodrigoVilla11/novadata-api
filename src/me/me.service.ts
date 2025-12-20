import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Employee, EmployeeDocument } from 'src/employees/schemas/employee.schema';
import { AttendanceDocument, AttendanceRecord,  } from 'src/attendance/schemas/attendance.schema';
import { ProductionEntry, ProductionDocument } from 'src/production/schemas/production.schema';

function isValidDateKey(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function diffHours(a?: Date | string | null, b?: Date | string | null) {
  if (!a || !b) return 0;
  const da = new Date(a);
  const db = new Date(b);
  const ms = db.getTime() - da.getTime();
  return ms > 0 ? ms / (1000 * 60 * 60) : 0;
}

@Injectable()
export class MeService {
  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(AttendanceRecord.name) private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(ProductionEntry.name) private readonly productionModel: Model<ProductionDocument>,
  ) {}

  private async getEmployeeOrThrow(userId: string) {
    const doc = await this.employeeModel.findOne({ userId: new Types.ObjectId(userId) }).lean();
    if (!doc) {
      throw new NotFoundException('Tu usuario no está vinculado a un empleado. Pedile al ADMIN que lo vincule.');
    }
    return doc;
  }

  async me(userId: string) {
    const emp = await this.getEmployeeOrThrow(userId);
    return {
      userId,
      employee: {
        id: String(emp._id),
        fullName: emp.fullName,
        hourlyRate: emp.hourlyRate,
        isActive: emp.isActive,
      },
    };
  }

  async checkIn(userId: string, dto: { dateKey: string; photoUrl?: string | null; notes?: string | null }) {
    if (!dto?.dateKey || !isValidDateKey(dto.dateKey)) {
      throw new BadRequestException('dateKey inválido (usar YYYY-MM-DD)');
    }
    const emp = await this.getEmployeeOrThrow(userId);

    // Reusar tu lógica actual pero forzando employeeId correcto
    // Acá lo hago simple con upsert y solo set si no existe
    const now = new Date();
    const employeeId = new Types.ObjectId(emp._id);

    const doc = await this.attendanceModel.findOneAndUpdate(
      { dateKey: dto.dateKey, employeeId },
      {
        $setOnInsert: {
          dateKey: dto.dateKey,
          employeeId,
          createdBy: new Types.ObjectId(userId),
          createdAt: now,
        },
        $set: {
          checkInAt: now,
          checkInPhotoUrl: dto.photoUrl ?? null,
          notes: dto.notes ?? null,
        },
      },
      { upsert: true, new: true },
    ).lean();

    return doc;
  }

  async checkOut(userId: string, dto: { dateKey: string; photoUrl?: string | null; notes?: string | null }) {
    if (!dto?.dateKey || !isValidDateKey(dto.dateKey)) {
      throw new BadRequestException('dateKey inválido (usar YYYY-MM-DD)');
    }
    const emp = await this.getEmployeeOrThrow(userId);

    const now = new Date();
    const employeeId = new Types.ObjectId(emp._id);

    const doc = await this.attendanceModel.findOneAndUpdate(
      { dateKey: dto.dateKey, employeeId },
      {
        $setOnInsert: {
          dateKey: dto.dateKey,
          employeeId,
          createdBy: new Types.ObjectId(userId),
          createdAt: now,
        },
        $set: {
          checkOutAt: now,
          checkOutPhotoUrl: dto.photoUrl ?? null,
          // si ya había notes, lo mantenemos; si querés pisar, dejalo así:
          notes: dto.notes ?? null,
        },
      },
      { upsert: true, new: true },
    ).lean();

    return doc;
  }

  async summary(userId: string, range: { from?: string; to?: string }) {
    const emp = await this.getEmployeeOrThrow(userId);

    const from = range.from?.trim();
    const to = range.to?.trim();
    if (!from || !to || !isValidDateKey(from) || !isValidDateKey(to)) {
      throw new BadRequestException('from/to inválidos (usar YYYY-MM-DD)');
    }

    const rows = await this.attendanceModel
      .find({
        employeeId: new Types.ObjectId(emp._id),
        dateKey: { $gte: from, $lte: to },
      })
      .sort({ dateKey: 1 })
      .lean();

    let totalHours = 0;
    const items = rows.map((r) => {
      const h = diffHours(r.checkInAt, r.checkOutAt);
      totalHours += h;
      return {
        id: String(r._id),
        dateKey: r.dateKey,
        checkInAt: r.checkInAt ?? null,
        checkOutAt: r.checkOutAt ?? null,
        hours: Math.round(h * 100) / 100,
      };
    });

    const hourlyRate = Number(emp.hourlyRate || 0);
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

  async production(userId: string, q: { dateKey?: string; from?: string; to?: string; limit?: number }) {
    const emp = await this.getEmployeeOrThrow(userId);

    const filter: any = { employeeId: new Types.ObjectId(emp._id) };
    if (q.dateKey?.trim()) {
      if (!isValidDateKey(q.dateKey.trim())) throw new BadRequestException('dateKey inválido');
      filter.dateKey = q.dateKey.trim();
    } else if (q.from?.trim() && q.to?.trim()) {
      if (!isValidDateKey(q.from.trim()) || !isValidDateKey(q.to.trim())) {
        throw new BadRequestException('from/to inválidos');
      }
      filter.dateKey = { $gte: q.from.trim(), $lte: q.to.trim() };
    }

    const rows = await this.productionModel
      .find(filter)
      .sort({ at: -1 })
      .limit(q.limit ?? 200)
      .lean();

    // si ya populás task/employee en service de production, genial.
    // sino devolvemos lo que haya; el front puede mostrar ids.
    return rows.map((r) => ({
      id: String(r._id),
      dateKey: r.dateKey,
      taskId: r.taskId ? String(r.taskId) : null,
      taskName: (r as any).taskName ?? null,
      notes: r.notes ?? null,
    }));
  }
}
