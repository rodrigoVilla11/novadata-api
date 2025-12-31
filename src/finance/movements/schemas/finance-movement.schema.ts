import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FinanceMovementDocument = FinanceMovement & Document;

export enum FinanceMovementType {
  INCOME = 'INCOME', // legacy
  EXPENSE = 'EXPENSE', // legacy
  TRANSFER = 'TRANSFER', // legacy (ahora se materializa con 2 asientos)
}

export enum FinanceMovementDirection {
  IN = 'IN',
  OUT = 'OUT',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export type FinanceMovementStatus = 'POSTED' | 'VOID';

export type FinanceMovementSource =
  | 'MANUAL'
  | 'CASH'
  | 'SALE'
  | 'SYSTEM'
  | 'ADJUSTMENT';

@Schema({ timestamps: true })
export class FinanceMovement {
  @Prop({ required: true, index: true })
  dateKey!: string; // YYYY-MM-DD

  // legacy (opcional mantener)
  @Prop({ required: true, enum: FinanceMovementType, index: true })
  type!: FinanceMovementType;

  // nuevo
  @Prop({ required: true, enum: FinanceMovementDirection, index: true })
  direction!: FinanceMovementDirection;

  @Prop({ required: true, min: 0 })
  amount!: number; // siempre positivo

  // Para ADJUSTMENT: +1 o -1
  @Prop({ type: Number, default: 1 })
  adjustmentSign?: 1 | -1;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  accountId!: Types.ObjectId;

  // Solo para “vista” o para asiento destino si querés tenerlo en el IN
  @Prop({ type: Types.ObjectId, default: null, index: true })
  toAccountId?: Types.ObjectId | null;

  // Para linkear transferencias (dos asientos)
  @Prop({ type: Types.ObjectId, default: null, index: true })
  transferGroupId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  categoryId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  providerId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  notes?: string | null;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ type: String, default: 'POSTED', index: true })
  status!: FinanceMovementStatus;

  @Prop({ type: String, default: 'MANUAL', index: true })
  source!: FinanceMovementSource;

  @Prop({ type: String, default: null, index: true })
  sourceRef?: string | null;

  // snapshots por si cambian nombres/codes
  @Prop({ type: String, default: null })
  accountNameSnapshot?: string | null;

  @Prop({ type: String, default: null })
  accountCodeSnapshot?: string | null;

  @Prop({ type: String, default: null })
  categoryNameSnapshot?: string | null;

  @Prop({ type: String, default: null })
  categoryCodeSnapshot?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FinanceMovementSchema =
  SchemaFactory.createForClass(FinanceMovement);

FinanceMovementSchema.index({
  dateKey: 1,
  direction: 1,
  accountId: 1,
  status: 1,
});
FinanceMovementSchema.index({ dateKey: 1, categoryId: 1, status: 1 });
FinanceMovementSchema.index({ createdByUserId: 1, dateKey: 1 });
FinanceMovementSchema.index({ transferGroupId: 1, dateKey: 1 });
FinanceMovementSchema.index({ source: 1, refType: 1, refId: 1 });
FinanceMovementSchema.index({ cashDayId: 1, createdAt: -1 });
