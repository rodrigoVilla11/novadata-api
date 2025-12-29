import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type CashDayDocument = HydratedDocument<CashDay>;

export enum CashDayStatus {
  OPEN = "OPEN",
  CLOSED = "CLOSED",
}

@Schema({ timestamps: true })
export class CashDay {
  @Prop({ required: true, index: true })
  dateKey: string; // YYYY-MM-DD

  // opcional: sucursal. Si no usás sucursales, dejalo null.
  @Prop({ type: Types.ObjectId, ref: "Branch", default: null, index: true })
  branchId?: Types.ObjectId | null;

  @Prop({ type: String, enum: CashDayStatus, default: CashDayStatus.OPEN, index: true })
  status: CashDayStatus;

  // Apertura
  @Prop({ type: Number, default: 0 })
  openingCash: number; // efectivo inicial

  @Prop({ type: Date, default: null })
  openedAt?: Date | null;

  @Prop({ type: String, default: null, index: true })
  openedByUserId?: string | null;

  // Cierre / arqueo
  @Prop({ type: Number, default: 0 })
  expectedCash: number; // efectivo esperado (calculado desde movimientos + openingCash)

  @Prop({ type: Number, default: null })
  countedCash?: number | null; // efectivo contado real

  @Prop({ type: Number, default: 0 })
  diffCash: number; // countedCash - expectedCash

  @Prop({ type: Date, default: null })
  closedAt?: Date | null;

  @Prop({ type: String, default: null, index: true })
  closedByUserId?: string | null;

  // Notas del cierre (admin override, etc.)
  @Prop({ type: String, trim: true, default: "" })
  closeNote?: string;
}

export const CashDaySchema = SchemaFactory.createForClass(CashDay);

// 1 caja por día (por sucursal)
CashDaySchema.index({ dateKey: 1, branchId: 1 }, { unique: true });
