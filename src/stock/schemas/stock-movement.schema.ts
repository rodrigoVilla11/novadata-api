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

  // ✅ Nuevo: saldo luego de aplicar el movimiento (para auditoría rápida)
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

  // ✅ Mejor: ObjectId (si tu ref apunta a docs Mongo). Si querés refs externas,
  // podés sumar un refIdText aparte.
  @Prop({ type: Types.ObjectId, default: null, index: true })
  refId?: Types.ObjectId | null;

  @Prop({ type: String, default: '' })
  note?: string;

  // ✅ Mejor: ObjectId + ref User
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  createdByUserId?: Types.ObjectId | null;

  // ✅ Nuevo: clave idempotente para evitar duplicados (unique cuando existe)
  @Prop({ type: String, default: null, index: true })
  dedupeKey?: string | null;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

// Listados comunes
StockMovementSchema.index({ ingredientId: 1, createdAt: -1 });
StockMovementSchema.index({ dateKey: 1, createdAt: -1 });

// Filtros típicos por rango
StockMovementSchema.index({ ingredientId: 1, dateKey: 1 });

// Búsqueda por referencia
StockMovementSchema.index({ refType: 1, refId: 1 });

// ✅ Idempotencia real (solo cuando dedupeKey es string)
StockMovementSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } },
  },
);

// (Opcional) si querés mantener el índice anterior para queries legacy:
StockMovementSchema.index({ refType: 1, refId: 1, ingredientId: 1, type: 1 });
