import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { StockMovementReason, StockMovementType,  } from "../enums/stock.enums";
import { Unit } from "src/ingredients/enums/unit.enum"; // ajustá path si es distinto

export type StockMovementDocument = HydratedDocument<StockMovement>;

@Schema({ timestamps: true })
export class StockMovement {
  @Prop({ required: true, index: true })
  dateKey: string; // YYYY-MM-DD (Argentina)

  @Prop({ type: Types.ObjectId, ref: "Ingredient", required: true, index: true })
  ingredientId: Types.ObjectId;

  @Prop({ type: String, enum: Unit, required: true })
  unit: Unit;

  @Prop({ type: String, enum: StockMovementType, required: true, index: true })
  type: StockMovementType;

  // siempre positivo; el signo lo define type
  @Prop({ type: Number, required: true, min: 0 })
  qty: number;

  @Prop({ type: String, enum: StockMovementReason, default: StockMovementReason.MANUAL, index: true })
  reason: StockMovementReason;

  // para linkear con órdenes/compras/etc
  @Prop({ type: String, default: null, index: true })
  refType?: string | null; // "ORDER" | "PURCHASE" | ...

  @Prop({ type: String, default: null, index: true })
  refId?: string | null; // orderId, purchaseId...

  @Prop({ type: String, default: "" })
  note?: string;

  @Prop({ type: String, default: null, index: true })
  createdByUserId?: string | null;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

// Para evitar aplicar 2 veces stock por la misma orden (si usás refType+refId)
StockMovementSchema.index(
  { refType: 1, refId: 1, ingredientId: 1, type: 1 },
  { unique: false },
);

// Para búsquedas por ingrediente/fecha
StockMovementSchema.index({ ingredientId: 1, createdAt: -1 });
StockMovementSchema.index({ dateKey: 1, createdAt: -1 });
