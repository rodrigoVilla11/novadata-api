import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Unit } from '../enums/unit.enum';

export type IngredientDocument = HydratedDocument<Ingredient>;

// Opcional: tipos simples (podés moverlos a /enums si querés)
export enum StorageType {
  AMBIENT = 'AMBIENT',
  REFRIGERATED = 'REFRIGERATED',
  FROZEN = 'FROZEN',
}

@Schema({ _id: false })
export class IngredientSupplier {
  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: true, index: true })
  supplierId: Types.ObjectId;

  // 👇 Nombre como figura en el proveedor (factura / lista)
  @Prop({ type: String, trim: true, default: null })
  name_for_supplier?: string | null;

  // Código del proveedor (SKU proveedor)
  @Prop({ type: String, trim: true, default: null })
  supplier_code?: string | null;

  // Unidad de compra (ej: caja, bolsa, bidón) como texto libre para no bloquearte
  @Prop({ type: String, trim: true, default: null })
  purchase_unit?: string | null;

  // Cantidad que trae 1 unidad de compra medida en baseUnit (ej bidón 5 lt => 5)
  @Prop({ type: Number, default: null, min: 0 })
  purchase_unit_qty?: number | null;

  // Precio de esa unidad de compra (si lo querés guardar por proveedor)
  @Prop({ type: Number, default: null, min: 0 })
  purchase_unit_price?: number | null;

  @Prop({ type: Boolean, default: false })
  preferred?: boolean;
}

@Schema({ _id: false })
export class IngredientCost {
  // costo unitario en baseUnit (ej: ARS por kg / por lt / por unid)
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

  // objetivo (ideal) opcional para sugerencias de compra
  @Prop({ type: Number, default: null, min: 0 })
  idealQty?: number | null;

  @Prop({ type: String, trim: true, default: null })
  storageLocation?: string | null;
}

@Schema({ _id: false })
export class IngredientFoodProps {
  @Prop({ type: Boolean, default: false })
  isFood: boolean;

  @Prop({ type: [String], default: [] })
  allergens: string[];

  @Prop({ type: [String], default: [] })
  dietFlags: string[];

  // merma estimada 0..1 (ej 0.05 = 5%)
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
  // ------------------------
  // Identidad
  // ------------------------
  @Prop({ type: String, required: true, trim: true })
  name: string;

  // 👇 nombre interno “corto” o como lo querés ver en el sistema (si difiere)
  @Prop({ type: String, trim: true, default: null })
  displayName?: string | null;

  // ------------------------
  // Unidad base (tu Unit enum)
  // ------------------------
  @Prop({ type: String, enum: Unit, required: true })
  baseUnit: Unit;

  // ------------------------
  // Proveedor principal (para compatibilidad con tu modelo actual)
  // ------------------------
  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: true, index: true })
  supplierId: Types.ObjectId;

  // 👇 pedido clave: nombre en proveedor (para 1 proveedor principal)
  @Prop({ type: String, trim: true, default: null })
  name_for_supplier?: string | null;

  // ------------------------
  // Activo
  // ------------------------
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  // ------------------------
  // Stock + costos
  // ------------------------
  @Prop({ type: IngredientStock, default: () => ({}) })
  stock: IngredientStock;

  @Prop({ type: IngredientCost, default: () => ({}) })
  cost: IngredientCost;

  // ------------------------
  // Multi-proveedor (opcional, para crecer)
  // ------------------------
  @Prop({ type: [IngredientSupplier], default: [] })
  suppliers: IngredientSupplier[];

  // ------------------------
  // Propiedades gastronómicas (opcional)
  // ------------------------
  @Prop({ type: IngredientFoodProps, default: () => ({}) })
  food: IngredientFoodProps;

  // ------------------------
  // Tags/categoría (opcional)
  // ------------------------
  @Prop({ type: Types.ObjectId, ref: 'IngredientCategory', default: null, index: true })
  categoryId?: Types.ObjectId | null;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, trim: true, default: null })
  notes?: string | null;
}

export const IngredientSchema = SchemaFactory.createForClass(Ingredient);

// Evita duplicados por proveedor principal (mismo nombre para mismo supplier)
IngredientSchema.index({ supplierId: 1, name: 1 }, { unique: true });

// Si querés también evitar duplicado por "name_for_supplier" dentro del supplier principal:
IngredientSchema.index(
  { supplierId: 1, name_for_supplier: 1 },
  {
    unique: true,
    partialFilterExpression: { name_for_supplier: { $type: 'string' } },
  },
);

// Para que no metas 2 veces el mismo supplier en suppliers[]
IngredientSchema.index(
  { _id: 1, 'suppliers.supplierId': 1 },
  { unique: true, sparse: true },
);
