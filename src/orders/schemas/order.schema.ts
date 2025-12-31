import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export type OrderSource = 'POS' | 'ONLINE';

export enum OrderFulfillment {
  DINE_IN = 'DINE_IN',     // salón
  TAKEAWAY = 'TAKEAWAY',   // retiro
  DELIVERY = 'DELIVERY',   // envío
}

@Schema({ _id: false })
export class OrderItem {
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
export class OrderCustomerSnapshot {
  @Prop({ type: String, trim: true, default: null })
  name?: string | null;

  @Prop({ type: String, trim: true, default: null })
  phone?: string | null;

  @Prop({ type: String, trim: true, default: null })
  addressLine1?: string | null;

  @Prop({ type: String, trim: true, default: null })
  addressLine2?: string | null;

  @Prop({ type: String, trim: true, default: null })
  notes?: string | null;
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: String, enum: OrderStatus, required: true, index: true })
  status: OrderStatus;

  @Prop({ type: String, required: true, index: true })
  source: OrderSource;

  // NUEVO
  @Prop({ type: String, enum: OrderFulfillment, default: OrderFulfillment.TAKEAWAY, index: true })
  fulfillment: OrderFulfillment;

  // Si tenés Customer real (online / clientes frecuentes)
  @Prop({ type: Types.ObjectId, ref: 'Customer', default: null, index: true })
  customerId?: Types.ObjectId | null;

  // Snapshot para POS rápido / delivery sin crear customer
  @Prop({ type: OrderCustomerSnapshot, default: null })
  customerSnapshot?: OrderCustomerSnapshot | null;

  @Prop({ type: [OrderItem], default: [] })
  items: OrderItem[];

  @Prop({ type: Number, default: 0, min: 0 })
  subtotal: number;

  @Prop({ type: Number, default: 0, min: 0 })
  total: number;

  @Prop({ type: String, trim: true, default: null })
  note?: string | null;

  @Prop({ type: String, trim: true, default: null })
  rejectionReason?: string | null;

  @Prop({ type: Date, default: null })
  acceptedAt?: Date | null;

  @Prop({ type: Date, default: null })
  rejectedAt?: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt?: Date | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ source: 1, createdAt: -1 });
OrderSchema.index({ fulfillment: 1, createdAt: -1 });
