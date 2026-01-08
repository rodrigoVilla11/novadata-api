import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AttendanceRecord,
  AttendanceDocument,
} from './schemas/attendance.schema';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary.dto';
import { Employee, EmployeeDocument } from 'src/employees/schemas/employee.schema';

function normalizeDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException('dateKey inválido (usar YYYY-MM-DD)');
  }
  return dateKey;
}

function toObjectId(id: string, label = 'id') {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`${label} inválido`);
  }
  return new Types.ObjectId(id);
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  private attendanceCollectionName() {
    // evita hardcodear "attendancerecords"
    return this.attendanceModel.collection.name;
  }

  private toDTO(doc: any) {
    return {
      id: String(doc._id),
      branchId: doc.branchId ? String(doc.branchId) : null, // ✅ NUEVO
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

  // ---------------------------------------------------------------------------
  // Guards / validations
  // ---------------------------------------------------------------------------

  private async assertEmployeeInBranch(employeeId: Types.ObjectId, branchId: Types.ObjectId) {
    const emp = await this.employeeModel
      .findOne({ _id: employeeId, branchId })
      .select({ _id: 1, branchId: 1 })
      .lean();

    if (!emp) {
      // o NotFoundException si preferís ocultar que existe en otra branch
      throw new ForbiddenException('Empleado no pertenece a tu sucursal');
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async getOne(params: { branchId: string; dateKey: string; employeeId: string }) {
    const branchId = toObjectId(params.branchId, 'branchId');
    const dateKey = normalizeDateKey(params.dateKey);
    const employeeId = toObjectId(params.employeeId, 'employeeId');

    const doc = await this.attendanceModel
      .findOne({ branchId, dateKey, employeeId })
      .lean();

    if (!doc) throw new NotFoundException('Asistencia no encontrada');
    return this.toDTO(doc);
  }

  async list(params: { branchId: string; dateKey?: string; employeeId?: string }) {
    const branchId = toObjectId(params.branchId, 'branchId');

    const filter: any = { branchId };
    if (params?.dateKey) filter.dateKey = normalizeDateKey(params.dateKey);
    if (params?.employeeId) filter.employeeId = toObjectId(params.employeeId, 'employeeId');

    const docs = await this.attendanceModel
      .find(filter)
      .sort({ dateKey: -1, checkInAt: -1 })
      .lean();

    return docs.map((d) => this.toDTO(d));
  }

  async listDay(params: { branchId: string; dateKey: string }) {
    const branchId = toObjectId(params.branchId, 'branchId');
    const dateKey = normalizeDateKey(params.dateKey);

    const docs = await this.attendanceModel
      .find({ branchId, dateKey })
      .sort({ checkInAt: 1 })
      .lean();

    return docs.map((d) => this.toDTO(d));
  }

  // ---------------------------------------------------------------------------
  // Check-in / Check-out
  // ---------------------------------------------------------------------------

  async checkIn(input: {
    branchId: string; // ✅ obligatorio
    dateKey: string;
    employeeId: string;
    photoUrl?: string | null;
    notes?: string | null;
    createdByUserId?: string | null;
    at?: Date;
  }) {
    const branchId = toObjectId(input.branchId, 'branchId');
    const dateKey = normalizeDateKey(input.dateKey);
    const employeeId = toObjectId(input.employeeId, 'employeeId');

    // ✅ seguridad: el empleado tiene que ser de la branch
    await this.assertEmployeeInBranch(employeeId, branchId);

    const now = input.at ?? new Date();

    // update pipeline:
    // - upsert por branchId+dateKey+employeeId
    // - checkInAt solo si null
    // - setea branchId siempre
    const pipeline: any[] = [
      {
        $set: {
          branchId,
          dateKey,
          employeeId,
          createdBy: input.createdByUserId ? toObjectId(input.createdByUserId, 'createdByUserId') : null,
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
    ];

    const doc = await this.attendanceModel
      .findOneAndUpdate({ branchId, dateKey, employeeId }, pipeline as any, {
        upsert: true,
        new: true,
        updatePipeline: true,
      })
      .lean();

    return this.toDTO(doc);
  }

  async checkOut(input: {
    branchId: string; // ✅ obligatorio
    dateKey: string;
    employeeId: string;
    photoUrl?: string | null;
    notes?: string | null;
    createdByUserId?: string | null;
    at?: Date;
  }) {
    const branchId = toObjectId(input.branchId, 'branchId');
    const dateKey = normalizeDateKey(input.dateKey);
    const employeeId = toObjectId(input.employeeId, 'employeeId');
    const now = input.at ?? new Date();

    // ✅ seguridad: el empleado tiene que ser de la branch
    await this.assertEmployeeInBranch(employeeId, branchId);

    const existing = await this.attendanceModel
      .findOne({ branchId, dateKey, employeeId })
      .lean();

    if (!existing) {
      throw new NotFoundException('No hay check-in para este empleado en esta fecha');
    }
    if (!existing.checkInAt) {
      throw new BadRequestException('El registro no tiene check-in');
    }
    if (existing.checkOutAt) {
      throw new BadRequestException('Ya existe check-out para este día');
    }
    if (now.getTime() < new Date(existing.checkInAt).getTime()) {
      throw new BadRequestException('check-out no puede ser antes del check-in');
    }

    const patch: any = {
      checkOutAt: now,
      checkOutPhotoUrl: input.photoUrl ?? null,
    };
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.createdByUserId) patch.createdBy = toObjectId(input.createdByUserId, 'createdByUserId');

    const doc = await this.attendanceModel
      .findOneAndUpdate({ branchId, dateKey, employeeId }, { $set: patch }, { new: true })
      .lean();

    return this.toDTO(doc);
  }

  // ---------------------------------------------------------------------------
  // Admin update (manual)
  // ---------------------------------------------------------------------------

  async update(params: { branchId: string; id: string; dto: UpdateAttendanceDto }) {
    const branchId = toObjectId(params.branchId, 'branchId');
    const id = toObjectId(params.id, 'id');

    const dto = params.dto;
    const patch: any = {};

    if ('checkInAt' in dto) patch.checkInAt = dto.checkInAt;
    if ('checkOutAt' in dto) patch.checkOutAt = dto.checkOutAt;
    if ('checkInPhotoUrl' in dto) patch.checkInPhotoUrl = dto.checkInPhotoUrl;
    if ('checkOutPhotoUrl' in dto) patch.checkOutPhotoUrl = dto.checkOutPhotoUrl;
    if ('notes' in dto) patch.notes = dto.notes;

    const doc = await this.attendanceModel
      .findOneAndUpdate({ _id: id, branchId }, { $set: patch }, { new: true })
      .lean();

    if (!doc) throw new NotFoundException('Asistencia no encontrada');

    return this.toDTO(doc);
  }

  // ---------------------------------------------------------------------------
  // Summary (por rango)
  // ---------------------------------------------------------------------------

  async summary(params: { branchId: string; q: AttendanceSummaryQueryDto }) {
    const branchId = toObjectId(params.branchId, 'branchId');

    const q = params.q;
    const from = normalizeDateKey(q.from);
    const to = normalizeDateKey(q.to);

    const onlyActive = (q.onlyActive ?? 'true') === 'true';

    const employeeMatch: any = { branchId }; // ✅ importantísimo
    if (q.employeeId) employeeMatch._id = toObjectId(q.employeeId, 'employeeId');
    if (onlyActive) employeeMatch.isActive = true;

    const attendanceCol = this.attendanceCollectionName();

    const pipeline: any[] = [
      { $match: employeeMatch },

      {
        $lookup: {
          from: attendanceCol,
          let: { empId: '$_id', hourlyRate: '$hourlyRate', brId: '$branchId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$branchId', '$$brId'] },          // ✅ filtra branch
                    { $eq: ['$employeeId', '$$empId'] },
                    { $gte: ['$dateKey', from] },
                    { $lte: ['$dateKey', to] },
                  ],
                },
              },
            },
            {
              $match: {
                checkInAt: { $ne: null },
                checkOutAt: { $ne: null },
              },
            },
            { $addFields: { _ms: { $subtract: ['$checkOutAt', '$checkInAt'] } } },
            {
              $addFields: {
                hours: {
                  $cond: [{ $gt: ['$_ms', 0] }, { $divide: ['$_ms', 1000 * 60 * 60] }, 0],
                },
              },
            },
            { $addFields: { pay: { $multiply: ['$hours', '$$hourlyRate'] } } },
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

      { $addFields: { _agg: { $ifNull: [{ $arrayElemAt: ['$agg', 0] }, null] } } },
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
      { $sort: { fullName: 1 } },
    ];

    const itemsRaw = await this.employeeModel.aggregate(pipeline);

    const totals = itemsRaw.reduce(
      (acc, it) => {
        acc.totalHours += Number(it.totalHours || 0);
        acc.totalPay += Number(it.totalPay || 0);
        return acc;
      },
      { totalHours: 0, totalPay: 0 },
    );

    const items = itemsRaw.map((it) => ({
      employeeId: String(it._id),
      fullName: it.fullName,
      hourlyRate: Number(it.hourlyRate || 0),
      isActive: !!it.isActive,
      totalHours: Number(it.totalHours || 0),
      totalPay: Number(it.totalPay || 0),
      daysWorked: Number(it.daysWorked || 0),
    }));

    return { range: { from, to }, totals, items };
  }
}
