import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type FinanceAccountDocument = FinanceAccount & Document;

export enum FinanceAccountType {
  CASH = "CASH",
  BANK = "BANK",
  WALLET = "WALLET",
}

@Schema({ timestamps: true })
export class FinanceAccount {
  @Prop({ required: true, trim: true, index: true })
  name!: string; // "Efectivo", "Santander", "Galicia", "Mercado Pago"

  @Prop({ required: true, enum: FinanceAccountType, index: true })
  type!: FinanceAccountType;

  @Prop({ default: "ARS" })
  currency!: string;

  // Saldo inicial (opcional) para arrancar la cuenta desde un monto
  @Prop({ default: 0 })
  openingBalance!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ type: String, default: null })
  notes?: string | null;

  @Prop({ type: Types.ObjectId, default: null, index: true })
createdByUserId?: Types.ObjectId | null;

  @Prop({ type: Date, default: null, index: true })
  deletedAt?: Date | null;
}

export const FinanceAccountSchema = SchemaFactory.createForClass(FinanceAccount);

// Para ordenar y filtrar rápido
FinanceAccountSchema.index({ isActive: 1, type: 1, name: 1 });

// Evitar duplicados por nombre (case-insensitive) sin romper migraciones.
// Si no querés unique, borrá estas líneas.
FinanceAccountSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
    collation: { locale: "en", strength: 2 }, // case-insensitive
  },
);
