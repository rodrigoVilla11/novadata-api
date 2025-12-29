import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type CustomerDocument = HydratedDocument<Customer>;

export enum CustomerTaxCondition {
  CONSUMIDOR_FINAL = "CONSUMIDOR_FINAL",
  RESPONSABLE_INSCRIPTO = "RESPONSABLE_INSCRIPTO",
  MONOTRIBUTO = "MONOTRIBUTO",
  EXENTO = "EXENTO",
  NO_INFORMADO = "NO_INFORMADO",
}

@Schema({ _id: false })
export class CustomerAddress {
  @Prop({ type: String, trim: true, default: "" })
  label?: string; // "Casa", "Trabajo"

  @Prop({ type: String, trim: true, default: "" })
  street?: string;

  @Prop({ type: String, trim: true, default: "" })
  number?: string;

  @Prop({ type: String, trim: true, default: "" })
  floor?: string;

  @Prop({ type: String, trim: true, default: "" })
  apartment?: string;

  @Prop({ type: String, trim: true, default: "" })
  city?: string;

  @Prop({ type: String, trim: true, default: "" })
  province?: string;

  @Prop({ type: String, trim: true, default: "" })
  postalCode?: string;

  @Prop({ type: String, trim: true, default: "" })
  notes?: string;
}

export const CustomerAddressSchema = SchemaFactory.createForClass(CustomerAddress);

@Schema({ timestamps: true })
export class Customer {
  @Prop({ type: String, required: true, trim: true, index: true })
  name: string;

  @Prop({ type: String, trim: true, lowercase: true, index: true, default: null })
  email?: string | null;

  @Prop({ type: String, trim: true, index: true, default: null })
  phone?: string | null;

  @Prop({ type: String, trim: true, default: null })
  document?: string | null; // DNI (opcional)

  @Prop({ type: String, trim: true, default: null, index: true })
  taxId?: string | null; // CUIT/CUIL

  @Prop({
    type: String,
    enum: CustomerTaxCondition,
    default: CustomerTaxCondition.NO_INFORMADO,
  })
  taxCondition: CustomerTaxCondition;

  @Prop({ type: [CustomerAddressSchema], default: [] })
  addresses: CustomerAddress[];

  @Prop({ type: String, trim: true, default: "" })
  notes?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  // cuenta corriente (se actualiza con ventas/pagos; por ahora solo lo guardamos)
  @Prop({ type: Number, default: 0 })
  balance: number;

  @Prop({ type: String, default: null, index: true })
  createdByUserId?: string | null;

  @Prop({ type: String, default: null, index: true })
  updatedByUserId?: string | null;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

// índices prácticos
CustomerSchema.index({ name: 1 });
CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ taxId: 1 });

// “búsqueda” simple (name/email/phone/taxId)
CustomerSchema.index({
  name: "text",
  email: "text",
  phone: "text",
  taxId: "text",
});
