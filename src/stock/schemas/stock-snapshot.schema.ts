import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { Unit } from "src/ingredients/enums/unit.enum";

export type StockSnapshotDocument = HydratedDocument<StockSnapshot>;

@Schema({ _id: false })
export class StockSnapshotItem {
  @Prop({ type: Types.ObjectId, ref: "Ingredient", required: true, index: true })
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

  @Prop({ type: String, default: null, index: true })
  createdByUserId?: string | null;

  @Prop({ type: String, default: "" })
  note?: string;
}

export const StockSnapshotSchema = SchemaFactory.createForClass(StockSnapshot);
StockSnapshotSchema.index({ dateKey: 1 }, { unique: true });
