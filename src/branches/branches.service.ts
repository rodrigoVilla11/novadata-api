import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Branch, BranchDocument, BranchPlan } from './schemas/branch.schema';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

function isValidObjectId(id: string) {
  return Types.ObjectId.isValid(id);
}

function toObjectId(id: string) {
  if (!isValidObjectId(id)) throw new BadRequestException('Invalid id');
  return new Types.ObjectId(id);
}

function trimOrNull(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function trimOrUndef(v: any): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function parseHHMM(s: string): number {
  // "HH:mm" -> minutos desde 00:00
  const [hh, mm] = s.split(':').map((x) => Number(x));
  return hh * 60 + mm;
}

/**
 * Normaliza + valida rangos de un día.
 *
 * Reglas:
 * - open !== close
 * - si NO cruza medianoche (open < close): se ordena por open y no pueden solaparse
 * - si cruza medianoche (open > close): solo permitimos 1 rango en el día (para evitar solapamientos raros)
 */
function normalizeAndValidateDay(dayKey: string, input: any) {
  if (!input) return { enabled: true, ranges: [] };

  const enabled = input.enabled === false ? false : true;
  const rawRanges: Array<{ open: string; close: string }> = Array.isArray(
    input.ranges,
  )
    ? input.ranges
    : [];

  // limpiar strings y descartar filas vacías
  const ranges = rawRanges
    .map((r) => ({
      open: String(r?.open ?? '').trim(),
      close: String(r?.close ?? '').trim(),
    }))
    .filter((r) => r.open && r.close);

  // validar open!=close y clasificar cruzamedianoche
  const parsed = ranges.map((r) => {
    const o = parseHHMM(r.open);
    const c = parseHHMM(r.close);
    if (o === c) {
      throw new BadRequestException(
        `schedule.${dayKey}: open and close cannot be the same (${r.open})`,
      );
    }
    return { ...r, o, c, crossesMidnight: o > c };
  });

  const crosses = parsed.filter((p) => p.crossesMidnight);
  if (crosses.length > 0) {
    // permitimos 1 rango cruzando medianoche y nada más
    if (parsed.length > 1) {
      throw new BadRequestException(
        `schedule.${dayKey}: ranges crossing midnight must be the only range for that day`,
      );
    }
    return {
      enabled,
      ranges: [{ open: parsed[0].open, close: parsed[0].close }],
    };
  }

  // no cruza medianoche: ordenar y validar solapamientos
  parsed.sort((a, b) => a.o - b.o);

  for (let i = 0; i < parsed.length; i++) {
    const cur = parsed[i];
    if (cur.o > cur.c) {
      // por seguridad (aunque arriba lo filtramos)
      throw new BadRequestException(
        `schedule.${dayKey}: invalid range ${cur.open}-${cur.close}`,
      );
    }

    if (i > 0) {
      const prev = parsed[i - 1];
      // solapamiento si prev.c > cur.o
      if (prev.c > cur.o) {
        throw new BadRequestException(
          `schedule.${dayKey}: overlapping ranges (${prev.open}-${prev.close}) and (${cur.open}-${cur.close})`,
        );
      }
    }
  }

  return {
    enabled,
    ranges: parsed.map((p) => ({ open: p.open, close: p.close })),
  };
}

function normalizeSchedule(input: any) {
  const src = input || {};
  return {
    mon: normalizeAndValidateDay('mon', src.mon),
    tue: normalizeAndValidateDay('tue', src.tue),
    wed: normalizeAndValidateDay('wed', src.wed),
    thu: normalizeAndValidateDay('thu', src.thu),
    fri: normalizeAndValidateDay('fri', src.fri),
    sat: normalizeAndValidateDay('sat', src.sat),
    sun: normalizeAndValidateDay('sun', src.sun),
  };
}

@Injectable()
export class BranchesService {
  constructor(
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
  ) {}

  private toRow(b: any) {
    return {
      id: String(b._id),
      name: b.name,
      description: b.description ?? null,
      plan: b.plan ?? BranchPlan.BASIC,
      isActive: !!b.isActive,

      address: b.address ?? null,
      city: b.city ?? null,
      postalCode: b.postalCode ?? null,
      phone: b.phone ?? null,
      whatsapp: b.whatsapp ?? null,
      gps: b.gps ?? null,

      timezone: b.timezone ?? 'America/Argentina/Buenos_Aires',
      schedule: b.schedule ?? null,

      notes: b.notes ?? null,

      deletedAt: b.deletedAt ?? null,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }

  async create(dto: CreateBranchDto) {
    const name = trimOrNull(dto.name);
    if (!name) throw new BadRequestException('name is required');

    const plan = dto.plan ?? BranchPlan.FREE;

    const docToCreate: any = {
      name,
      description: trimOrNull(dto.description),
      plan,
      planStartedAt: new Date(), // ✅ arranca el contador del plan

      isActive: dto.isActive ?? true,

      address: trimOrNull(dto.address),
      city: trimOrNull(dto.city),
      postalCode: trimOrNull(dto.postalCode),
      phone: trimOrNull(dto.phone),
      whatsapp: trimOrNull(dto.whatsapp),
      gps: trimOrNull(dto.gps),

      timezone: trimOrNull(dto.timezone) ?? 'America/Argentina/Buenos_Aires',
      schedule: normalizeSchedule(dto.schedule),

      notes: trimOrNull(dto.notes),
      deletedAt: null,
    };

    try {
      const created = await new this.branchModel(docToCreate).save();
      return this.toRow(created.toObject());
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException('Branch name already exists');
      throw e;
    }
  }

  async findAll(q?: { includeDeleted?: boolean }) {
    const filter: any = {};
    if (!q?.includeDeleted) filter.deletedAt = null;

    const rows = await this.branchModel.find(filter).sort({ name: 1 }).lean();

    return rows.map((r) => this.toRow(r));
  }

  async findOne(id: string) {
    const _id = toObjectId(id);
    const doc = await this.branchModel.findById(_id).lean();
    if (!doc) throw new NotFoundException('Branch not found');
    return this.toRow(doc);
  }

  async update(id: string, dto: UpdateBranchDto) {
    const _id = toObjectId(id);

    const patch: any = {};

    if (dto.name !== undefined) {
      const v = trimOrNull(dto.name);
      if (!v) throw new BadRequestException('name cannot be empty');
      patch.name = v;
    }

    if (dto.description !== undefined)
      patch.description = trimOrNull(dto.description);

    if (dto.plan !== undefined) patch.plan = dto.plan;
    if (dto.isActive !== undefined) patch.isActive = !!dto.isActive;

    if (dto.address !== undefined) patch.address = trimOrNull(dto.address);
    if (dto.city !== undefined) patch.city = trimOrNull(dto.city);
    if (dto.postalCode !== undefined)
      patch.postalCode = trimOrNull(dto.postalCode);
    if (dto.phone !== undefined) patch.phone = trimOrNull(dto.phone);
    if (dto.whatsapp !== undefined) patch.whatsapp = trimOrNull(dto.whatsapp);
    if (dto.gps !== undefined) patch.gps = trimOrNull(dto.gps);

    if (dto.timezone !== undefined) patch.timezone = trimOrNull(dto.timezone);

    if (dto.schedule !== undefined)
      patch.schedule = normalizeSchedule(dto.schedule);

    if (dto.notes !== undefined) patch.notes = trimOrNull(dto.notes);

    try {
      const updated = await this.branchModel
        .findOneAndUpdate({ _id }, { $set: patch }, { new: true })
        .lean();

      if (!updated) throw new NotFoundException('Branch not found');
      return this.toRow(updated);
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException('Branch name already exists');
      throw e;
    }
  }

  async remove(id: string) {
    const _id = toObjectId(id);

    const doc = await this.branchModel
      .findOneAndUpdate(
        { _id, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { new: true },
      )
      .lean();

    if (!doc)
      throw new NotFoundException('Branch not found or already deleted');
    return this.toRow(doc);
  }

  async restore(id: string) {
    const _id = toObjectId(id);

    const doc = await this.branchModel
      .findOneAndUpdate({ _id }, { $set: { deletedAt: null } }, { new: true })
      .lean();

    if (!doc) throw new NotFoundException('Branch not found');
    return this.toRow(doc);
  }
}
