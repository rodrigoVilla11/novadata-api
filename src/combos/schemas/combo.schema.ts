import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type ComboDocument = HydratedDocument<Combo>;

export enum ComboPricingType {
  FIXED = "FIXED",
  DISCOUNT_PCT = "DISCOUNT_PCT", // 0..1 (ej 0.2 = 20%)
  DISCOUNT_AMOUNT = "DISCOUNT_AMOUNT", // monto positivo a descontar
}

@Schema({ _id: false })
export class ComboItem {
  @Prop({ type: Types.ObjectId, ref: "Product", required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  qty: number;

  @Prop({ type: String, default: null, trim: true })
  note?: string | null;
}

@Schema({ _id: false })
export class ComboComputed {
  @Prop({ type: Number, default: 0 })
  itemsBasePrice: number;

  // negativo si es descuento, 0 si FIXED
  @Prop({ type: Number, default: 0 })
  discountAmount: number;

  @Prop({ type: Number, default: 0 })
  finalPrice: number;

  @Prop({ type: String, default: "ARS" })
  currency: "ARS" | "USD";

  @Prop({ type: Date, default: null })
  computedAt?: Date | null;
}

@Schema({ timestamps: true })
export class Combo {
  @Prop({ type: Types.ObjectId, ref: "Branch", required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: null, trim: true })
  description?: string | null;

  @Prop({ type: String, default: null, trim: true, index: true })
  sku?: string | null;

  @Prop({ type: String, default: null, trim: true, index: true })
  barcode?: string | null;

  @Prop({ type: String, enum: ComboPricingType, required: true })
  pricingType: ComboPricingType;

  @Prop({ type: Number, required: true, min: 0 })
  pricingValue: number;

  @Prop({ type: String, default: "ARS" })
  currency: "ARS" | "USD";

  @Prop({ type: Date, default: null, index: true })
  activeFrom?: Date | null;

  @Prop({ type: Date, default: null, index: true })
  activeTo?: Date | null;

  @Prop({ type: [ComboItem], default: [] })
  items: ComboItem[];

  @Prop({ type: [String], default: [], index: true })
  tags: string[];

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: ComboComputed, default: () => ({}) })
  computed: ComboComputed;
}

export const ComboSchema = SchemaFactory.createForClass(Combo);

ComboSchema.index({ branchId: 1, name: 1 }, { unique: true });
ComboSchema.index({ sku: 1 }, { unique: true, sparse: true });
ComboSchema.index({ barcode: 1 }, { unique: true, sparse: true });
ComboSchema.index({ branchId: 1, isActive: 1 });
ComboSchema.index({ branchId: 1, tags: 1 });
