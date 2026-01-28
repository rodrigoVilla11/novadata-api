import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type OrderCounterDocument = HydratedDocument<OrderCounter>;

@Schema({ timestamps: true })
export class OrderCounter {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  dateKey: string; // YYYY-MM-DD

  @Prop({ type: Number, required: true, default: 0 })
  seq: number; // last used
}

export const OrderCounterSchema = SchemaFactory.createForClass(OrderCounter);

OrderCounterSchema.index({ branchId: 1, dateKey: 1 }, { unique: true });
