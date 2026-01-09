import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductionDocument = HydratedDocument<ProductionEntry>;
export type ProductionStatus = 'PENDING' | 'DONE' | 'CANCELED';

@Schema({ _id: false })
export class ProductionNote {
  @Prop({ type: String, trim: true, required: true })
  text!: string;

  @Prop({ type: Date, default: () => new Date(), index: true })
  createdAt!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy!: Types.ObjectId;
}
export const ProductionNoteSchema = SchemaFactory.createForClass(ProductionNote);

@Schema({ timestamps: true })
export class ProductionEntry {
  // ✅ NUEVO: branchId operativo
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, index: true })
  dateKey!: string; // YYYY-MM-DD

  @Prop({ type: Date, required: true, index: true })
  performedAt!: Date;

  @Prop({ type: String, required: true, trim: true })
  time!: string; // "HH:mm"

  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  taskId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['PENDING', 'DONE', 'CANCELED'],
    default: 'PENDING',
    index: true,
  })
  status!: ProductionStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  canceledBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  canceledAt!: Date | null;

  @Prop({ type: Boolean, default: false, index: true })
  isDone!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  doneBy!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  doneAt!: Date | null;

  @Prop({ type: Number, default: null, min: 0 })
  qty!: number | null;

  @Prop({ type: [ProductionNoteSchema], default: [] })
  notes!: ProductionNote[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const ProductionSchema = SchemaFactory.createForClass(ProductionEntry);

// 🔥 Índices recomendados (multi-sucursal)
ProductionSchema.index({ branchId: 1, dateKey: 1, performedAt: 1 });
ProductionSchema.index({ branchId: 1, employeeId: 1, dateKey: 1 });
ProductionSchema.index({ branchId: 1, taskId: 1, dateKey: 1 });
ProductionSchema.index({ branchId: 1, status: 1, dateKey: 1 });
ProductionSchema.index({ branchId: 1, isDone: 1, dateKey: 1 });

// (opcional) si querés ordenar por reciente rápido
ProductionSchema.index({ branchId: 1, createdAt: -1 });
