// stock-movement.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { StockMovementReason, StockMovementType } from '../enums/stock.enums';
import { Unit } from 'src/ingredients/enums/unit.enum';

export type StockMovementDocument = HydratedDocument<StockMovement>;

function isFiniteNumber(v: any) {
  return Number.isFinite(Number(v));
}

@Schema({ timestamps: true })
export class StockMovement {
  // ✅ NUEVO
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, index: true })
  dateKey: string; // YYYY-MM-DD

  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true, index: true })
  ingredientId: Types.ObjectId;

  @Prop({ type: String, enum: Unit, required: true })
  unit: Unit;

  @Prop({ type: String, enum: StockMovementType, required: true, index: true })
  type: StockMovementType;

  @Prop({
    type: Number,
    required: true,
    validate: {
      validator: function (this: any, v: number) {
        if (!isFiniteNumber(v)) return false;

        const n = Number(v);
        const t = this.type;

        if (t === StockMovementType.IN) return n > 0;
        if (t === StockMovementType.OUT) return n < 0;
        if (t === StockMovementType.ADJUST) return n !== 0;
        if (t === StockMovementType.REVERSAL) return n !== 0;

        return true;
      },
      message: 'qty sign is invalid for movement type',
    },
  })
  qty: number;

  @Prop({ type: Number, default: null })
  qtyAfter?: number | null;

  @Prop({
    type: String,
    enum: StockMovementReason,
    default: StockMovementReason.MANUAL,
    index: true,
  })
  reason: StockMovementReason;

  @Prop({ type: String, default: null, index: true })
  refType?: string | null;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  refId?: Types.ObjectId | null;

  @Prop({ type: String, default: '' })
  note?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  createdByUserId?: Types.ObjectId | null;

  @Prop({ type: String, default: null, index: true })
  dedupeKey?: string | null;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

// ✅ Índices actualizados con branchId
StockMovementSchema.index({ branchId: 1, ingredientId: 1, createdAt: -1 });
StockMovementSchema.index({ branchId: 1, dateKey: 1, createdAt: -1 });
StockMovementSchema.index({ branchId: 1, ingredientId: 1, dateKey: 1 });
StockMovementSchema.index({ branchId: 1, refType: 1, refId: 1 });

// ✅ Idempotencia real (pero aislada por branch)
StockMovementSchema.index(
  { branchId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } },
  },
);

// (Opcional) si tenías legacy:
StockMovementSchema.index({
  branchId: 1,
  refType: 1,
  refId: 1,
  ingredientId: 1,
  type: 1,
});
