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

export const ClosingBalanceRowSchema =
  SchemaFactory.createForClass(ClosingBalanceRow);

export type ClosingStatus = "OPEN" | "SUBMITTED" | "LOCKED";

@Schema({ timestamps: true })
export class FinanceDayClosing {
  /* ======================
   * Multi-branch
   * ====================== */
  @Prop({
    type: Types.ObjectId,
    ref: "Branch",
    required: true,
    index: true,
  })
  branchId!: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
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

export const FinanceDayClosingSchema =
  SchemaFactory.createForClass(FinanceDayClosing);

/* ======================
 * Índices (multi-branch)
 * ====================== */

// ✅ único por sucursal + día
FinanceDayClosingSchema.index(
  { branchId: 1, dateKey: 1 },
  { unique: true },
);

// listados
FinanceDayClosingSchema.index({ branchId: 1, status: 1, dateKey: -1 });

// opcional: búsquedas/joins por cuentas dentro de arrays
FinanceDayClosingSchema.index({ branchId: 1, dateKey: 1, "declaredBalances.accountId": 1 });
FinanceDayClosingSchema.index({ branchId: 1, dateKey: 1, "computedBalances.accountId": 1 });
FinanceDayClosingSchema.index({ branchId: 1, dateKey: 1, "diffBalances.accountId": 1 });
