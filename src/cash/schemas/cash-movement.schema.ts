import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CashMovementDocument = HydratedDocument<CashMovement>;

export enum CashMovementType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  CARD = 'CARD',
  OTHER = 'OTHER',
}

@Schema({ timestamps: true })
export class CashMovement {
  @Prop({ type: Types.ObjectId, ref: 'CashDay', required: true, index: true })
  cashDayId: Types.ObjectId;

  @Prop({ type: String, enum: CashMovementType, required: true, index: true })
  type: CashMovementType;

  @Prop({ type: String, enum: PaymentMethod, required: true, index: true })
  method: PaymentMethod;

  // amount > 0 siempre (el signo lo da type)
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  // En el futuro lo conectamos directo con FinanceCategory
  @Prop({
    type: Types.ObjectId,
    ref: 'FinanceCategory',
    default: null,
    index: true,
  })
  categoryId?: Types.ObjectId | null;

  @Prop({ type: String, trim: true, default: '' })
  concept?: string; // "Venta mostrador", "Pago proveedor", etc.

  @Prop({ type: String, trim: true, default: '' })
  note?: string;

  @Prop({ type: String, default: null, index: true })
  createdByUserId?: string | null;

  @Prop({ type: Boolean, default: false, index: true })
  voided: boolean;

  @Prop({ type: Date, default: null })
  voidedAt?: Date | null;

  @Prop({ type: String, default: null, index: true })
  voidedByUserId?: string | null;

  @Prop({ type: String, trim: true, default: '' })
  voidReason?: string;

  @Prop({ type: String, trim: true, default: null, index: true })
  refType?: string | null; // "SALE", "SALE_VOID", etc.

  @Prop({ type: String, trim: true, default: null, index: true })
  refId?: string | null; // saleId (string)
}

export const CashMovementSchema = SchemaFactory.createForClass(CashMovement);

CashMovementSchema.index({ cashDayId: 1, createdAt: -1 });
