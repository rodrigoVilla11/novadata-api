import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PaymentMethod } from 'src/cash/schemas/cash-movement.schema';

export type SaleDocument = HydratedDocument<Sale>;

export enum SaleStatus {
  DRAFT = 'DRAFT',
  PAID = 'PAID',
  VOIDED = 'VOIDED',
}

export type SaleSource = 'POS' | 'ONLINE';

@Schema({ _id: false })
export class SaleItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  qty: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitPrice: number;

  @Prop({ type: Number, required: true, min: 0 })
  lineTotal: number;

  @Prop({ type: String, trim: true, default: null })
  note?: string | null;
}

@Schema({ _id: false })
export class SalePayment {
  @Prop({ type: String, enum: PaymentMethod, required: true })
  method: PaymentMethod;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, trim: true, default: null })
  note?: string | null;
}

@Schema({ timestamps: true })
export class Sale {
  // ✅ NUEVO: multi-branch
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: String, enum: SaleStatus, required: true, index: true })
  status: SaleStatus;

  @Prop({ type: String, required: true, index: true })
  source: SaleSource;

  @Prop({ type: Types.ObjectId, ref: 'Order', default: null, index: true })
  orderId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Customer', default: null, index: true })
  customerId?: Types.ObjectId | null;

  @Prop({ type: [SaleItem], default: [] })
  items: SaleItem[];

  @Prop({ type: Number, default: 0, min: 0 })
  subtotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  total: number;

  @Prop({ type: [SalePayment], default: [] })
  payments: SalePayment[];

  @Prop({ type: Number, default: 0, min: 0 })
  paidTotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  change: number;

  @Prop({ type: Date, default: null })
  paidAt?: Date | null;

  @Prop({ type: String, trim: true, default: null })
  note?: string | null;

  @Prop({ type: Boolean, default: false })
  voided: boolean;

  @Prop({ type: Date, default: null })
  voidedAt?: Date | null;

  @Prop({ type: String, trim: true, default: null })
  voidReason?: string | null;

  @Prop({ type: String, default: null })
  createdByUserId?: string | null;

  @Prop({ type: String, default: null })
  paidByUserId?: string | null;

  @Prop({ type: String, default: null, index: true })
  paidDateKey?: string | null; // YYYY-MM-DD
}

export const SaleSchema = SchemaFactory.createForClass(Sale);

// ✅ índices: siempre con branchId
SaleSchema.index({ branchId: 1, status: 1, createdAt: -1 });
SaleSchema.index({ branchId: 1, paidDateKey: 1, createdAt: -1 });

// ✅ unique por orderId PERO por branch (para multi-tenant real)
SaleSchema.index(
  { branchId: 1, orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { orderId: { $type: 'objectId' } },
  },
);
