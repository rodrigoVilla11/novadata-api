// src/sales/schemas/sale.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export enum SaleStatus {
  OPEN = 'OPEN',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Schema({ _id: false })
export class SaleItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  qty: number;

  @Prop({ type: Number, required: true })
  unitPrice: number;

  @Prop({ type: Number, required: true })
  total: number;
}

@Schema({ _id: false })
export class Payment {
  @Prop({ type: String, required: true })
  method: 'CASH' | 'CARD' | 'TRANSFER';

  @Prop({ type: Number, required: true })
  amount: number;
}

@Schema({ timestamps: true })
export class Sale {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  orderId: Types.ObjectId;

  @Prop({ type: String, enum: SaleStatus, required: true })
  status: SaleStatus;

  @Prop({ type: [SaleItem], default: [] })
  items: SaleItem[];

  @Prop({ type: [Payment], default: [] })
  payments: Payment[];

  @Prop({ type: Number, required: true })
  total: number;

  @Prop({ type: String, required: true }) // YYYY-MM-DD
  dateKey: string;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);
