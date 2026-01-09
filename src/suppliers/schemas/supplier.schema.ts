import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type SupplierDocument = HydratedDocument<Supplier>;

export enum SupplierWorkMode {
  IMMEDIATE = "IMMEDIATE",          // pago inmediato
  AGAINST_INVOICE = "AGAINST_INVOICE", // contra factura / contra entrega
  ACCOUNT = "ACCOUNT",              // cuenta corriente
  MIXED = "MIXED",                  // depende producto/condición
}

export enum Weekday {
  MON = "MON",
  TUE = "TUE",
  WED = "WED",
  THU = "THU",
  FRI = "FRI",
  SAT = "SAT",
  SUN = "SUN",
}

@Schema({ timestamps: true })
export class Supplier {
  @Prop({ type: Types.ObjectId, ref: "Branch", required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  // Contacto
  @Prop({ type: String, trim: true, default: null })
  contactName?: string | null;

  @Prop({ type: String, trim: true, default: null })
  phone?: string | null;

  @Prop({ type: String, trim: true, lowercase: true, default: null })
  email?: string | null;

  // Comercial / forma de trabajo
  @Prop({ type: String, enum: SupplierWorkMode, default: SupplierWorkMode.IMMEDIATE })
  workMode: SupplierWorkMode;

  // Si es cuenta corriente (o mixto), esto define el plazo típico
  @Prop({ type: Number, default: null, min: 0 })
  paymentDays?: number | null; // 15, 30, 45...

  // Días en los que se hacen pedidos
  @Prop({ type: [String], enum: Weekday, default: [] })
  orderDays: Weekday[];

  // Opcionales útiles
  @Prop({ type: Number, default: null, min: 0 })
  leadTimeDays?: number | null; // demora de entrega típica

  @Prop({ type: String, default: null })
  cutoffTime?: string | null; // "12:00" (hora límite)

  @Prop({ type: String, default: null })
  notes?: string | null;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);

SupplierSchema.index({ branchId: 1, name: 1 }, { unique: true });
SupplierSchema.index({ branchId: 1, isActive: 1 });
