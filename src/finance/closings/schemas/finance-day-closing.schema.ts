import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type FinanceDayClosingDocument = FinanceDayClosing & Document;

@Schema({ _id: false })
export class ClosingBalanceRow {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  accountId!: Types.ObjectId;

  @Prop({ type: Number, required: true })
  balance!: number;
}

export const ClosingBalanceRowSchema = SchemaFactory.createForClass(ClosingBalanceRow);

export type ClosingStatus = "OPEN" | "SUBMITTED" | "LOCKED";

@Schema({ timestamps: true })
export class FinanceDayClosing {
  @Prop({ type: String, required: true, index: true, unique: true })
  dateKey!: string; // YYYY-MM-DD

  @Prop({ type: String, default: "OPEN", index: true })
  status!: ClosingStatus;

  // Lo que declara el cashier al cierre
  @Prop({ type: [ClosingBalanceRowSchema], default: [] })
  declaredBalances!: ClosingBalanceRow[];

  // Lo que calcula el sistema desde movimientos
  @Prop({ type: [ClosingBalanceRowSchema], default: [] })
  computedBalances!: ClosingBalanceRow[];

  // declared - computed
  @Prop({ type: [ClosingBalanceRowSchema], default: [] })
  diffBalances!: ClosingBalanceRow[];

  @Prop({ type: String, default: null })
  notes?: string | null;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  createdByUserId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  submittedByUserId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  lockedByUserId?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  submittedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lockedAt?: Date | null;
}

export const FinanceDayClosingSchema = SchemaFactory.createForClass(FinanceDayClosing);

FinanceDayClosingSchema.index({ dateKey: 1 }, { unique: true });
FinanceDayClosingSchema.index({ status: 1, dateKey: -1 });
