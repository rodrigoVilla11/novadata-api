import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FinanceCategoryDocument = FinanceCategory & Document;

export enum FinanceCategoryType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  BOTH = 'BOTH',
}

@Schema({ timestamps: true })
export class FinanceCategory {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, enum: FinanceCategoryType, index: true })
  type!: FinanceCategoryType;

  // ✅ FIX: declarar type explícito
  @Prop({ type: Types.ObjectId, default: null, index: true })
  parentId?: Types.ObjectId | null;

  @Prop({ default: 0 })
  order?: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  createdByUserId?: Types.ObjectId | null;

  @Prop({ type: Date, default: null, index: true })
  deletedAt?: Date | null;
}

export const FinanceCategorySchema =
  SchemaFactory.createForClass(FinanceCategory);

FinanceCategorySchema.index({
  type: 1,
  isActive: 1,
  parentId: 1,
  order: 1,
  name: 1,
});
