// src/orders/schemas/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  qty: number;

  @Prop({ type: Number, required: true, min: 0 })
  unitPrice: number; // snapshot del precio

  @Prop({ type: String, trim: true, default: null })
  note?: string | null;
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: String, enum: OrderStatus, required: true, index: true })
  status: OrderStatus;

  @Prop({ type: String, required: true })
  source: 'POS' | 'ONLINE';

  @Prop({ type: Types.ObjectId, ref: 'Customer', default: null })
  customerId?: Types.ObjectId | null;

  @Prop({ type: [OrderItem], default: [] })
  items: OrderItem[];

  @Prop({ type: Number, default: 0 })
  subtotal: number;

  @Prop({ type: Number, default: 0 })
  total: number;

  @Prop({ type: String, trim: true, default: null })
  note?: string | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
