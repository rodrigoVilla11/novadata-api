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
  // Identificador estable (no cambia aunque cambie el nombre visible)
  // Ej: "cash", "mp", "santander"
  @Prop({ required: true, trim: true, index: true })
  code!: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string; // "Efectivo", "Santander", "Galicia", "Mercado Pago"

  @Prop({ required: true, enum: FinanceAccountType, index: true })
  type!: FinanceAccountType;

  @Prop({ default: "ARS" })
  currency!: string;

  @Prop({ default: 0 })
  openingBalance!: number;

  // Para que closings/cash no tenga lógica hardcodeada por type
  @Prop({ default: true, index: true })
  requiresClosing!: boolean;

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

FinanceAccountSchema.index({ isActive: 1, type: 1, name: 1 });
FinanceAccountSchema.index({ isActive: 1, requiresClosing: 1, type: 1 });

// Unicidad por code (case-insensitive) solo para no eliminados
FinanceAccountSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
    collation: { locale: "en", strength: 2 },
  },
);

// Mantengo tu unique por name (case-insensitive) para no duplicar nombres visibles.
// Si preferís permitir nombres repetidos, borrá este index.
FinanceAccountSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
    collation: { locale: "en", strength: 2 },
  },
);
