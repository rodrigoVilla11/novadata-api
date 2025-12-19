import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type StockSnapshotDocument = HydratedDocument<StockSnapshot>;

@Schema({ _id: false })
export class StockSnapshotItem {
  @Prop({ type: Types.ObjectId, ref: "Product", required: true })
  productId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  qty: number;
}

const StockSnapshotItemSchema = SchemaFactory.createForClass(StockSnapshotItem);

@Schema({ timestamps: true })
export class StockSnapshot {
  // YYYY-MM-DD
  @Prop({ required: true, trim: true })
  dateKey: string;

  @Prop({ type: Types.ObjectId, ref: "Supplier", required: true, index: true })
  supplierId: Types.ObjectId;

  @Prop({ type: [StockSnapshotItemSchema], default: [] })
  items: StockSnapshotItem[];

  // opcional: quién lo cargó
  @Prop({ type: Types.ObjectId, ref: "User", default: null })
  createdBy: Types.ObjectId | null;
}

export const StockSnapshotSchema = SchemaFactory.createForClass(StockSnapshot);

// ✅ 1 snapshot por día + proveedor
StockSnapshotSchema.index({ dateKey: 1, supplierId: 1 }, { unique: true });
