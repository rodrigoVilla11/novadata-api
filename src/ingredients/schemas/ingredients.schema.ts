import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Unit } from '../enums/unit.enum';

export type IngredientDocument = HydratedDocument<Ingredient>;

export enum StorageType {
  AMBIENT = 'AMBIENT',
  REFRIGERATED = 'REFRIGERATED',
  FROZEN = 'FROZEN',
}

@Schema({ _id: false })
export class IngredientSupplier {
  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: true, index: true })
  supplierId: Types.ObjectId;

  @Prop({ type: String, trim: true, default: null })
  name_for_supplier?: string | null;

  @Prop({ type: String, trim: true, default: null })
  supplier_code?: string | null;

  @Prop({ type: String, trim: true, default: null })
  purchase_unit?: string | null;

  @Prop({ type: Number, default: null, min: 0 })
  purchase_unit_qty?: number | null;

  @Prop({ type: Number, default: null, min: 0 })
  purchase_unit_price?: number | null;

  @Prop({ type: Boolean, default: false })
  preferred?: boolean;
}

@Schema({ _id: false })
export class IngredientCost {
  @Prop({ type: Number, default: 0, min: 0 })
  lastCost: number;

  @Prop({ type: Number, default: 0, min: 0 })
  avgCost: number;

  @Prop({ type: String, default: 'ARS' })
  currency: 'ARS' | 'USD';
}

@Schema({ _id: false })
export class IngredientStock {
  @Prop({ type: Boolean, default: true })
  trackStock: boolean;

  @Prop({ type: Number, default: 0 })
  onHand: number;

  @Prop({ type: Number, default: 0 })
  reserved: number;

  @Prop({ type: Number, default: 0, min: 0 })
  minQty: number;

  @Prop({ type: Number, default: null, min: 0 })
  idealQty?: number | null;

  @Prop({ type: String, trim: true, default: null })
  storageLocation?: string | null;

  @Prop({ type: Number, default: 0 })
  totalIn: number;

  @Prop({ type: Number, default: 0 })
  totalOut: number;

  @Prop({ type: Date, default: null })
  lastMovementAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastRecountAt?: Date | null;
}

@Schema({ _id: false })
export class IngredientFoodProps {
  @Prop({ type: Boolean, default: false })
  isFood: boolean;

  @Prop({ type: [String], default: [] })
  allergens: string[];

  @Prop({ type: [String], default: [] })
  dietFlags: string[];

  @Prop({ type: Number, default: 0, min: 0, max: 1 })
  wastePct: number;

  @Prop({ type: String, enum: StorageType, default: StorageType.AMBIENT })
  storageType: StorageType;

  @Prop({ type: Number, default: null, min: 0 })
  shelfLifeDays?: number | null;

  @Prop({ type: Number, default: null, min: 0 })
  openedShelfLifeDays?: number | null;
}

@Schema({ timestamps: true })
export class Ingredient {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, trim: true, default: null })
  displayName?: string | null;

  // ✅ NUEVO: branchId obligatorio
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: String, enum: Unit, required: true })
  baseUnit: Unit;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: true, index: true })
  supplierId: Types.ObjectId;

  @Prop({ type: String, trim: true, default: null })
  name_for_supplier?: string | null;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: IngredientStock, default: () => ({}) })
  stock: IngredientStock;

  @Prop({ type: IngredientCost, default: () => ({}) })
  cost: IngredientCost;

  @Prop({ type: [IngredientSupplier], default: [] })
  suppliers: IngredientSupplier[];

  @Prop({ type: IngredientFoodProps, default: () => ({}) })
  food: IngredientFoodProps;

  @Prop({
    type: Types.ObjectId,
    ref: 'IngredientCategory',
    default: null,
    index: true,
  })
  categoryId?: Types.ObjectId | null;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, trim: true, default: null })
  notes?: string | null;
}

export const IngredientSchema = SchemaFactory.createForClass(Ingredient);

/**
 * ✅ Unicidad principal por sucursal:
 * mismo name NO se repite dentro del mismo branchId
 */
IngredientSchema.index({ branchId: 1, name: 1 }, { unique: true });

/**
 * (Opcional) Si querés evitar duplicado de "name_for_supplier" dentro de la sucursal para el supplier principal:
 * - esto permite que otra sucursal use el mismo name_for_supplier sin conflicto
 */
IngredientSchema.index(
  { branchId: 1, supplierId: 1, name_for_supplier: 1 },
  {
    unique: true,
    partialFilterExpression: { name_for_supplier: { $type: 'string' } },
  },
);

/**
 * Índices útiles para búsqueda/listado
 */
IngredientSchema.index({ branchId: 1, supplierId: 1 });
IngredientSchema.index({ branchId: 1, isActive: 1 });
IngredientSchema.index({ branchId: 1, tags: 1 });
