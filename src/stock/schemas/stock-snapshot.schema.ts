// stock-snapshot.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Unit } from 'src/ingredients/enums/unit.enum';

export type StockSnapshotDocument = HydratedDocument<StockSnapshot>;

@Schema({ _id: false })
export class StockSnapshotItem {
  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true, index: true })
  ingredientId: Types.ObjectId;

  @Prop({ type: String, enum: Unit, required: true })
  unit: Unit;

  @Prop({ type: Number, required: true })
  qty: number;
}

@Schema({ timestamps: true })
export class StockSnapshot {
  @Prop({ required: true, index: true })
  dateKey: string; // corte (YYYY-MM-DD)

  @Prop({ type: [StockSnapshotItem], default: [] })
  items: StockSnapshotItem[];

  // ✅ Mejor: ObjectId + ref User
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  createdByUserId?: Types.ObjectId | null;

  @Prop({ type: String, default: '' })
  note?: string;

  // ✅ Nuevo: metadata útil para reportes
  @Prop({ type: String, default: 'AUTO', index: true })
  source?: 'AUTO' | 'MANUAL';

  @Prop({ type: Number, default: 0 })
  totalItems?: number;

  @Prop({ type: Number, default: 0 })
  totalQty?: number;
}

export const StockSnapshotSchema = SchemaFactory.createForClass(StockSnapshot);

StockSnapshotSchema.index({ dateKey: 1 }, { unique: true });

// (Opcional) si listás por fecha descendente:
StockSnapshotSchema.index({ createdAt: -1 });
