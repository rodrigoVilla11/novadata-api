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

  @Prop({ type: String, trim: true, required: true })
  ingredientName: string;

  @Prop({ type: String, trim: true, default: null })
  name_for_supplier?: string | null;

  @Prop({ type: Number, required: true, min: 0 })
  qty: number;

  @Prop({ type: String, enum: Unit, required: true })
  unit: Unit;

  @Prop({ type: Number, default: 0, min: 0 })
  approxUnitPrice: number;

  @Prop({ type: Number, default: 0, min: 0 })
  approxLineTotal: number;

  @Prop({ type: Number, default: null, min: 0 })
  realUnitPrice?: number | null;

  @Prop({ type: Number, default: null, min: 0 })
  realLineTotal?: number | null;

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
  // ✅ NUEVO: multi-branch
  @Prop({ type: Types.ObjectId, ref: "Branch", required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Supplier", required: true, index: true })
  supplierId: Types.ObjectId;

  @Prop({ type: String, trim: true, required: true })
  supplierName: string;

  @Prop({
    type: String,
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.DRAFT,
    index: true,
  })
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

// ✅ Índices: siempre con branchId adelante
PurchaseOrderSchema.index({ branchId: 1, supplierId: 1, orderDate: -1 });
PurchaseOrderSchema.index({ branchId: 1, status: 1, orderDate: -1 });

// ✅ Listar activos (soft delete)
PurchaseOrderSchema.index({ branchId: 1, deletedAt: 1, orderDate: -1 });
