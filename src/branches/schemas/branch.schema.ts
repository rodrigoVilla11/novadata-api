import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BranchDocument = HydratedDocument<Branch>;

export enum BranchPlan {
  FREE = 'FREE',
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  PRO = 'PRO',
}

/* =========================
 * Schedule models
 * ========================= */

@Schema({ _id: false })
export class TimeRange {
  @Prop({ type: String, required: true, trim: true })
  open!: string; // "HH:mm"

  @Prop({ type: String, required: true, trim: true })
  close!: string; // "HH:mm"
}
export const TimeRangeSchema = SchemaFactory.createForClass(TimeRange);

@Schema({ _id: false })
export class DaySchedule {
  @Prop({ type: Boolean, default: true })
  enabled!: boolean;

  @Prop({ type: [TimeRangeSchema], default: [] })
  ranges!: TimeRange[];
}
export const DayScheduleSchema = SchemaFactory.createForClass(DaySchedule);

@Schema({ _id: false })
export class WeekSchedule {
  @Prop({
    type: DayScheduleSchema,
    default: () => ({ enabled: true, ranges: [] }),
  })
  mon!: DaySchedule;

  @Prop({
    type: DayScheduleSchema,
    default: () => ({ enabled: true, ranges: [] }),
  })
  tue!: DaySchedule;

  @Prop({
    type: DayScheduleSchema,
    default: () => ({ enabled: true, ranges: [] }),
  })
  wed!: DaySchedule;

  @Prop({
    type: DayScheduleSchema,
    default: () => ({ enabled: true, ranges: [] }),
  })
  thu!: DaySchedule;

  @Prop({
    type: DayScheduleSchema,
    default: () => ({ enabled: true, ranges: [] }),
  })
  fri!: DaySchedule;

  @Prop({
    type: DayScheduleSchema,
    default: () => ({ enabled: true, ranges: [] }),
  })
  sat!: DaySchedule;

  @Prop({
    type: DayScheduleSchema,
    default: () => ({ enabled: true, ranges: [] }),
  })
  sun!: DaySchedule;
}
export const WeekScheduleSchema = SchemaFactory.createForClass(WeekSchedule);

/* =========================
 * Branch
 * ========================= */

@Schema({ timestamps: true })
export class Branch {
  // Identidad
  @Prop({ type: String, required: true, trim: true, index: true })
  name!: string;

  @Prop({ type: String, default: null, trim: true })
  description?: string | null;

  // Plan del sistema
  @Prop({
    type: String,
    enum: BranchPlan,
    default: BranchPlan.FREE,
    index: true,
  })
  plan!: BranchPlan;

  @Prop({ type: Date, default: null, index: true })
  planStartedAt?: Date | null;

  // Estado
  @Prop({ type: Boolean, default: true, index: true })
  isActive!: boolean;

  // Ubicación / contacto
  @Prop({ type: String, default: null, trim: true })
  address?: string | null;

  @Prop({ type: String, default: null, trim: true })
  city?: string | null;

  @Prop({ type: String, default: null, trim: true })
  postalCode?: string | null;

  @Prop({ type: String, default: null, trim: true })
  phone?: string | null;

  @Prop({ type: String, default: null, trim: true })
  whatsapp?: string | null;

  /**
   * GPS "lat, lon"
   */
  @Prop({ type: String, default: null, trim: true })
  gps?: string | null;

  // Timezone
  @Prop({ type: String, default: 'America/Argentina/Buenos_Aires', trim: true })
  timezone!: string;

  // Horarios por día
  @Prop({ type: WeekScheduleSchema, default: () => ({}) })
  schedule!: WeekSchedule;

  // Notas internas
  @Prop({ type: String, default: null, trim: true })
  notes?: string | null;

  // Soft delete
  @Prop({ type: Date, default: null, index: true })
  deletedAt?: Date | null;
}

export const BranchSchema = SchemaFactory.createForClass(Branch);

/* =========================
 * Indexes
 * ========================= */

BranchSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

BranchSchema.index({ isActive: 1, plan: 1 });
