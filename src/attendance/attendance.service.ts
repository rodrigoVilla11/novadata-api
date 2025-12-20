import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AttendanceRecord,
  AttendanceDocument,
} from './schemas/attendance.schema';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary.dto';
import { Employee } from 'src/employees/schemas/employee.schema';

function normalizeDateKey(dateKey: string) {
  // Esperamos YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException('dateKey inválido (usar YYYY-MM-DD)');
  }
  return dateKey;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<Employee>,
  ) {}

  private toDTO(doc: any) {
    return {
      id: String(doc._id),
      dateKey: doc.dateKey,
      employeeId: String(doc.employeeId),
      checkInAt: doc.checkInAt,
      checkOutAt: doc.checkOutAt,
      checkInPhotoUrl: doc.checkInPhotoUrl ?? null,
      checkOutPhotoUrl: doc.checkOutPhotoUrl ?? null,
      createdBy: doc.createdBy ? String(doc.createdBy) : null,
      notes: doc.notes ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async getOne(params: { dateKey: string; employeeId: string }) {
    const dateKey = normalizeDateKey(params.dateKey);
    const employeeId = new Types.ObjectId(params.employeeId);

    const doc = await this.attendanceModel
      .findOne({ dateKey, employeeId })
      .lean();

    if (!doc) throw new NotFoundException('Asistencia no encontrada');
    return this.toDTO(doc);
  }

  async list(params?: { dateKey?: string; employeeId?: string }) {
    const filter: any = {};
    if (params?.dateKey) filter.dateKey = normalizeDateKey(params.dateKey);
    if (params?.employeeId)
      filter.employeeId = new Types.ObjectId(params.employeeId);

    const docs = await this.attendanceModel
      .find(filter)
      .sort({ dateKey: -1, checkInAt: -1 })
      .lean();

    return docs.map((d) => this.toDTO(d));
  }

  async listDay(dateKeyRaw: string) {
    const dateKey = normalizeDateKey(dateKeyRaw);

    const docs = await this.attendanceModel
      .find({ dateKey })
      .sort({ checkInAt: 1 })
      .lean();

    return docs.map((d) => this.toDTO(d));
  }

  async checkIn(input: {
    dateKey: string;
    employeeId: string;
    photoUrl?: string | null;
    notes?: string | null;
    createdByUserId?: string | null;
    at?: Date; // opcional (si querés forzar hora desde server)
  }) {
    const dateKey = normalizeDateKey(input.dateKey);
    const employeeId = new Types.ObjectId(input.employeeId);

    const now = input.at ?? new Date();
    const patch: any = {
      dateKey,
      employeeId,
      // si ya estaba seteado checkInAt, NO lo pisamos por defecto (queda el primero)
      $setOnInsert: {
        createdBy: input.createdByUserId
          ? new Types.ObjectId(input.createdByUserId)
          : null,
      },
      $set: {
        // Si no existe checkInAt, lo seteamos. (Lo resolvemos con update pipeline abajo)
      },
    };

    // Usamos update pipeline para:
    // - setear checkInAt solo si es null
    // - setear foto de entrada si llega
    // - guardar notes si llega
    const pipeline: any[] = [
      {
        $set: {
          dateKey,
          employeeId,
          createdBy: input.createdByUserId
            ? new Types.ObjectId(input.createdByUserId)
            : null,
          checkInAt: { $ifNull: ['$checkInAt', now] },
          checkInPhotoUrl:
            input.photoUrl !== undefined
              ? input.photoUrl
              : { $ifNull: ['$checkInPhotoUrl', null] },
          notes:
            input.notes !== undefined
              ? input.notes
              : { $ifNull: ['$notes', null] },
        },
      },
      // si no tenía checkOut, queda igual
    ];

    const doc = await this.attendanceModel
      .findOneAndUpdate({ dateKey, employeeId }, pipeline as any, {
        upsert: true,
        new: true,
        updatePipeline: true, // ✅ importante
      })
      .lean();

    return this.toDTO(doc);
  }

  async checkOut(input: {
    dateKey: string;
    employeeId: string;
    photoUrl?: string | null;
    notes?: string | null;
    createdByUserId?: string | null;
    at?: Date;
  }) {
    const dateKey = normalizeDateKey(input.dateKey);
    const employeeId = new Types.ObjectId(input.employeeId);
    const now = input.at ?? new Date();

    const existing = await this.attendanceModel
      .findOne({ dateKey, employeeId })
      .lean();

    if (!existing) {
      throw new NotFoundException(
        'No hay check-in para este empleado en esta fecha',
      );
    }
    if (!existing.checkInAt) {
      throw new BadRequestException('El registro no tiene check-in');
    }
    if (existing.checkOutAt) {
      // si querés permitir re-checkout, cambialo por update
      throw new BadRequestException('Ya existe check-out para este día');
    }

    if (now.getTime() < new Date(existing.checkInAt).getTime()) {
      throw new BadRequestException(
        'check-out no puede ser antes del check-in',
      );
    }

    const patch: any = {
      checkOutAt: now,
      checkOutPhotoUrl: input.photoUrl ?? null,
    };

    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.createdByUserId)
      patch.createdBy = new Types.ObjectId(input.createdByUserId);

    const doc = await this.attendanceModel
      .findOneAndUpdate({ dateKey, employeeId }, { $set: patch }, { new: true })
      .lean();

    return this.toDTO(doc);
  }

  async update(id: string, dto: UpdateAttendanceDto) {
    const patch: any = {};

    if ('checkInAt' in dto) patch.checkInAt = dto.checkInAt;
    if ('checkOutAt' in dto) patch.checkOutAt = dto.checkOutAt;
    if ('checkInPhotoUrl' in dto) patch.checkInPhotoUrl = dto.checkInPhotoUrl;
    if ('checkOutPhotoUrl' in dto)
      patch.checkOutPhotoUrl = dto.checkOutPhotoUrl;
    if ('notes' in dto) patch.notes = dto.notes;

    const doc = await this.attendanceModel
      .findByIdAndUpdate(id, patch, { new: true })
      .lean();

    if (!doc) throw new NotFoundException('Asistencia no encontrada');

    return this.toDTO(doc);
  }

  async summary(q: AttendanceSummaryQueryDto) {
    const from = q.from;
    const to = q.to;

    const onlyActive = (q.onlyActive ?? 'true') === 'true';

    const employeeMatch: any = {};
    if (q.employeeId) employeeMatch._id = new Types.ObjectId(q.employeeId);
    if (onlyActive) employeeMatch.isActive = true;

    const pipeline: any[] = [
      // 1) arrancamos desde EMPLOYEES para devolver "todos"
      { $match: employeeMatch },

      // 2) lookup attendance por rango y empleado
      {
        $lookup: {
          from: 'attendancerecords', // 👈 nombre real de la collection de Attendance (ver nota abajo)
          let: { empId: '$_id', hourlyRate: '$hourlyRate' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$employeeId', '$$empId'] },
                    { $gte: ['$dateKey', from] },
                    { $lte: ['$dateKey', to] },
                  ],
                },
              },
            },
            // solo registros “computables”
            {
              $match: {
                checkInAt: { $ne: null },
                checkOutAt: { $ne: null },
              },
            },
            // hours = max(0, (checkOutAt - checkInAt) / 3600000)
            {
              $addFields: {
                _ms: { $subtract: ['$checkOutAt', '$checkInAt'] },
              },
            },
            {
              $addFields: {
                hours: {
                  $cond: [
                    { $gt: ['$_ms', 0] },
                    { $divide: ['$_ms', 1000 * 60 * 60] },
                    0,
                  ],
                },
              },
            },
            // pay = hours * hourlyRate (del empleado)
            {
              $addFields: {
                pay: { $multiply: ['$hours', '$$hourlyRate'] },
              },
            },
            {
              $group: {
                _id: null,
                totalHours: { $sum: '$hours' },
                totalPay: { $sum: '$pay' },
                daysWorked: { $sum: 1 },
              },
            },
          ],
          as: 'agg',
        },
      },

      // 3) aplanamos agg (si no hay, queda 0)
      {
        $addFields: {
          _agg: { $ifNull: [{ $arrayElemAt: ['$agg', 0] }, null] },
        },
      },
      {
        $project: {
          _id: 1,
          fullName: 1,
          hourlyRate: 1,
          isActive: 1,
          totalHours: { $ifNull: ['$_agg.totalHours', 0] },
          totalPay: { $ifNull: ['$_agg.totalPay', 0] },
          daysWorked: { $ifNull: ['$_agg.daysWorked', 0] },
        },
      },

      // 4) orden por nombre
      { $sort: { fullName: 1 } },
    ];

    const itemsRaw = await this.employeeModel.aggregate(pipeline);

    // Totales generales
    const totals = itemsRaw.reduce(
      (acc, it) => {
        acc.totalHours += Number(it.totalHours || 0);
        acc.totalPay += Number(it.totalPay || 0);
        return acc;
      },
      { totalHours: 0, totalPay: 0 },
    );

    // formato final
    const items = itemsRaw.map((it) => ({
      employeeId: String(it._id),
      fullName: it.fullName,
      hourlyRate: Number(it.hourlyRate || 0),
      isActive: !!it.isActive,
      totalHours: Number(it.totalHours || 0),
      totalPay: Number(it.totalPay || 0),
      daysWorked: Number(it.daysWorked || 0),
    }));

    return {
      range: { from, to },
      totals,
      items,
    };
  }
}
