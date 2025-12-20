import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type ProductionDocument = HydratedDocument<ProductionEntry>;

@Schema({ timestamps: true })
export class ProductionEntry {
  @Prop({ required: true, trim: true, index: true })
  dateKey: string; // YYYY-MM-DD

  @Prop({ type: Date, required: true, index: true })
  performedAt: Date; // fecha+hora exacta

  @Prop({ type: Types.ObjectId, ref: "Employee", required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Task", required: true, index: true })
  taskId: Types.ObjectId;

  @Prop({ type: Number, default: null, min: 0 })
  qty: number | null;

  @Prop({ type: String, default: null })
  notes: string | null;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  createdBy: Types.ObjectId;
}

export const ProductionSchema = SchemaFactory.createForClass(ProductionEntry);

ProductionSchema.index({ dateKey: 1, performedAt: 1 });
ProductionSchema.index({ employeeId: 1, dateKey: 1 });
ProductionSchema.index({ taskId: 1, dateKey: 1 });
