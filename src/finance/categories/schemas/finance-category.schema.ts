import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type FinanceCategoryDocument = FinanceCategory & Document;

export enum FinanceCategoryType {
  INCOME = "INCOME",
  EXPENSE = "EXPENSE",
  BOTH = "BOTH", // legacy/compat
}

export enum FinanceCategoryDirection {
  IN = "IN",
  OUT = "OUT",
  TRANSFER = "TRANSFER",
  ADJUSTMENT = "ADJUSTMENT",
}

@Schema({ timestamps: true })
export class FinanceCategory {
  @Prop({ required: true, trim: true, index: true })
  code!: string; // ej: "ventas", "sueldos", "proveedores", "transferencias"

  @Prop({ required: true, trim: true })
  name!: string;

  // legacy/compat: lo podés dejar mientras migrás
  @Prop({ required: true, enum: FinanceCategoryType, index: true })
  type!: FinanceCategoryType;

  // nuevo: el que usa movements/stats
  @Prop({ required: true, enum: FinanceCategoryDirection, index: true })
  direction!: FinanceCategoryDirection;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  parentId?: Types.ObjectId | null;

  @Prop({ default: 0 })
  order?: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  // Para P&L (resultado)
  @Prop({ default: true, index: true })
  affectsProfit!: boolean;

  // Para dashboards/stats (permitís ocultar internas)
  @Prop({ default: true, index: true })
  includeInStats!: boolean;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  createdByUserId?: Types.ObjectId | null;

  @Prop({ type: Date, default: null, index: true })
  deletedAt?: Date | null;
}

export const FinanceCategorySchema = SchemaFactory.createForClass(FinanceCategory);

FinanceCategorySchema.index({
  direction: 1,
  type: 1,
  isActive: 1,
  parentId: 1,
  order: 1,
  name: 1,
});

// Unique por code (case-insensitive) y no borradas
FinanceCategorySchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
    collation: { locale: "en", strength: 2 },
  },
);

// Opcional: evitar duplicado de name dentro del mismo padre/direction
FinanceCategorySchema.index(
  { parentId: 1, direction: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
    collation: { locale: "en", strength: 2 },
  },
);
