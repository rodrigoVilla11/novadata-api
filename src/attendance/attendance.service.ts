import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  AttendanceRecord,
  AttendanceDocument,
} from "./schemas/attendance.schema";

function normalizeDateKey(dateKey: string) {
  // Esperamos YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException("dateKey inválido (usar YYYY-MM-DD)");
  }
  return dateKey;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceDocument>
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

    if (!doc) throw new NotFoundException("Asistencia no encontrada");
    return this.toDTO(doc);
  }

  async list(params?: { dateKey?: string; employeeId?: string }) {
    const filter: any = {};
    if (params?.dateKey) filter.dateKey = normalizeDateKey(params.dateKey);
    if (params?.employeeId) filter.employeeId = new Types.ObjectId(params.employeeId);

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
          checkInAt: { $ifNull: ["$checkInAt", now] },
          checkInPhotoUrl:
            input.photoUrl !== undefined
              ? input.photoUrl
              : { $ifNull: ["$checkInPhotoUrl", null] },
          notes:
            input.notes !== undefined
              ? input.notes
              : { $ifNull: ["$notes", null] },
        },
      },
      // si no tenía checkOut, queda igual
    ];

    const doc = await this.attendanceModel
      .findOneAndUpdate(
        { dateKey, employeeId },
        pipeline as any,
        { upsert: true, new: true }
      )
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
        "No hay check-in para este empleado en esta fecha"
      );
    }
    if (!existing.checkInAt) {
      throw new BadRequestException("El registro no tiene check-in");
    }
    if (existing.checkOutAt) {
      // si querés permitir re-checkout, cambialo por update
      throw new BadRequestException("Ya existe check-out para este día");
    }

    if (now.getTime() < new Date(existing.checkInAt).getTime()) {
      throw new BadRequestException("check-out no puede ser antes del check-in");
    }

    const patch: any = {
      checkOutAt: now,
      checkOutPhotoUrl: input.photoUrl ?? null,
    };

    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.createdByUserId) patch.createdBy = new Types.ObjectId(input.createdByUserId);

    const doc = await this.attendanceModel
      .findOneAndUpdate({ dateKey, employeeId }, { $set: patch }, { new: true })
      .lean();

    return this.toDTO(doc);
  }
}
