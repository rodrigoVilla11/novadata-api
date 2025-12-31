// src/purchase-orders/schemas/purchase-order.schema.ts
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { Unit } from "src/ingredients/enums/unit.enum";
import { PurchaseOrderStatus } from "../enums/purchase-order.enums";

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;

@Schema({ _id: false })
export class PurchaseOrderInvoice {
  @Prop({ type: String, trim: true, default: null })
  imageUrl?: string | null;

  @Prop({ type: String, trim: true, default: null })
  imagePublicId?: string | null;

  @Prop({ type: String, trim: true, default: null })
  pdfUrl?: string | null;

  @Prop({ type: String, trim: true, default: null })
  pdfPublicId?: string | null;

  @Prop({ type: String, trim: true, default: null })
  invoiceNumber?: string | null;

  @Prop({ type: Date, default: null })
  invoiceDate?: Date | null;
}

@Schema({ _id: false })
export class PurchaseOrderItem {
  @Prop({ type: Types.ObjectId, ref: "Ingredient", required: true, index: true })
  ingredientId: Types.ObjectId;

  // snapshots (para que quede “como se pidió”)
  @Prop({ type: String, trim: true, required: true })
  ingredientName: string;

  @Prop({ type: String, trim: true, default: null })
  name_for_supplier?: string | null;

  // Cantidad pedida en baseUnit del ingrediente
  @Prop({ type: Number, required: true, min: 0 })
  qty: number;

  @Prop({ type: String, enum: Unit, required: true })
  unit: Unit;

  // Estimado (cuando armás el pedido)
  @Prop({ type: Number, default: 0, min: 0 })
  approxUnitPrice: number;

  @Prop({ type: Number, default: 0, min: 0 })
  approxLineTotal: number;

  // Real (cuando llega la factura)
  @Prop({ type: Number, default: null, min: 0 })
  realUnitPrice?: number | null;

  @Prop({ type: Number, default: null, min: 0 })
  realLineTotal?: number | null;

  // Recibido (para parcial)
  @Prop({ type: Number, default: 0, min: 0 })
  receivedQty: number;

  @Prop({ type: String, trim: true, default: null })
  note?: string | null;
}

@Schema({ _id: false })
export class PurchaseOrderTotals {
  @Prop({ type: Number, default: 0, min: 0 })
  approxTotal: number;

  @Prop({ type: Number, default: null, min: 0 })
  realTotal?: number | null;

  @Prop({ type: String, default: "ARS" })
  currency: "ARS" | "USD";
}

@Schema({ timestamps: true })
export class PurchaseOrder {
  @Prop({ type: Types.ObjectId, ref: "Supplier", required: true, index: true })
  supplierId: Types.ObjectId;

  // snapshot
  @Prop({ type: String, trim: true, required: true })
  supplierName: string;

  @Prop({ type: String, enum: PurchaseOrderStatus, default: PurchaseOrderStatus.DRAFT, index: true })
  status: PurchaseOrderStatus;

  @Prop({ type: Date, default: () => new Date(), index: true })
  orderDate: Date;

  @Prop({ type: Date, default: null })
  expectedDate?: Date | null;

  @Prop({ type: [PurchaseOrderItem], default: [] })
  items: PurchaseOrderItem[];

  @Prop({ type: PurchaseOrderTotals, default: () => ({}) })
  totals: PurchaseOrderTotals;

  @Prop({ type: PurchaseOrderInvoice, default: () => ({}) })
  invoice: PurchaseOrderInvoice;

  @Prop({ type: String, trim: true, default: null })
  notes?: string | null;

  @Prop({ type: Date, default: null, index: true })
  deletedAt?: Date | null;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);

PurchaseOrderSchema.index({ supplierId: 1, orderDate: -1 });
PurchaseOrderSchema.index({ status: 1, orderDate: -1 });
