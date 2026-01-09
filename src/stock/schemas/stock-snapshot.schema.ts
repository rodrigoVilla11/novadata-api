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
  // ✅ NUEVO
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, index: true })
  dateKey: string; // YYYY-MM-DD

  @Prop({ type: [StockSnapshotItem], default: [] })
  items: StockSnapshotItem[];

  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  createdByUserId?: Types.ObjectId | null;

  @Prop({ type: String, default: '' })
  note?: string;

  @Prop({ type: String, default: 'AUTO', index: true })
  source?: 'AUTO' | 'MANUAL';

  @Prop({ type: Number, default: 0 })
  totalItems?: number;

  @Prop({ type: Number, default: 0 })
  totalQty?: number;
}

export const StockSnapshotSchema = SchemaFactory.createForClass(StockSnapshot);

// ✅ Cambiar unique (antes era {dateKey} global)
StockSnapshotSchema.index({ branchId: 1, dateKey: 1 }, { unique: true });
StockSnapshotSchema.index({ branchId: 1, createdAt: -1 });
