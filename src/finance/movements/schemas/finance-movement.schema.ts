import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type FinanceMovementDocument = FinanceMovement & Document;

export enum FinanceMovementType {
  INCOME = "INCOME",
  EXPENSE = "EXPENSE",
  TRANSFER = "TRANSFER",
}

@Schema({ timestamps: true })
export class FinanceMovement {
  @Prop({ required: true, index: true })
  dateKey!: string; // "YYYY-MM-DD" (Argentina)

  @Prop({ required: true, enum: FinanceMovementType, index: true })
  type!: FinanceMovementType;

  @Prop({ required: true, min: 0 })
  amount!: number; // siempre positivo

  @Prop({ type: Types.ObjectId, required: true, index: true })
  accountId!: Types.ObjectId;

  // solo para TRANSFER
  @Prop({ type: Types.ObjectId, default: null, index: true })
  toAccountId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  categoryId?: Types.ObjectId | null;

  // (Opcional) proveedor más adelante
  @Prop({ type: Types.ObjectId, default: null, index: true })
  providerId?: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  notes?: string | null;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  createdByUserId!: Types.ObjectId;

  @Prop({ default: "POSTED", index: true })
  status!: "POSTED" | "VOID";

  // snapshots opcionales (por si cambian nombres)
  @Prop({ type: String, default: null })
  accountNameSnapshot?: string | null;

  @Prop({ type: String, default: null })
  categoryNameSnapshot?: string | null;
}

export const FinanceMovementSchema = SchemaFactory.createForClass(FinanceMovement);

FinanceMovementSchema.index({ dateKey: 1, type: 1, accountId: 1 });
FinanceMovementSchema.index({ dateKey: 1, categoryId: 1 });
FinanceMovementSchema.index({ createdByUserId: 1, dateKey: 1 });
