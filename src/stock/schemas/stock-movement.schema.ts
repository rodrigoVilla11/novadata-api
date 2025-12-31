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
  @Prop({ required: true, index: true })
  dateKey: string; // YYYY-MM-DD

  @Prop({ type: Types.ObjectId, ref: 'Ingredient', required: true, index: true })
  ingredientId: Types.ObjectId;

  @Prop({ type: String, enum: Unit, required: true })
  unit: Unit;

  @Prop({ type: String, enum: StockMovementType, required: true, index: true })
  type: StockMovementType;

  // qty SIGNED:
  // IN  => > 0
  // OUT => < 0
  // ADJUST / REVERSAL => != 0
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

  @Prop({
    type: String,
    enum: StockMovementReason,
    default: StockMovementReason.MANUAL,
    index: true,
  })
  reason: StockMovementReason;

  @Prop({ type: String, default: null, index: true })
  refType?: string | null;

  @Prop({ type: String, default: null, index: true })
  refId?: string | null;

  @Prop({ type: String, default: '' })
  note?: string;

  @Prop({ type: String, default: null, index: true })
  createdByUserId?: string | null;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);


StockMovementSchema.index({ ingredientId: 1, createdAt: -1 });
StockMovementSchema.index({ dateKey: 1, createdAt: -1 });
StockMovementSchema.index({ refType: 1, refId: 1, ingredientId: 1, type: 1 });
