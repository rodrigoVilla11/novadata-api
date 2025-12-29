import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Unit } from '../../ingredients/enums/unit.enum';

export type ProductDocument = HydratedDocument<Product>;

export enum ProductItemType {
  INGREDIENT = 'INGREDIENT',
  PREPARATION = 'PREPARATION',
}

export enum Allergen {
  GLUTEN = 'GLUTEN',
  SOY = 'SOY',
  SESAME = 'SESAME',
  EGG = 'EGG',
  MILK = 'MILK',
  FISH = 'FISH',
  SHELLFISH = 'SHELLFISH',
  PEANUT = 'PEANUT',
  TREE_NUTS = 'TREE_NUTS',
  MUSTARD = 'MUSTARD',
  CELERY = 'CELERY',
  SULPHITES = 'SULPHITES',
}

@Schema({ _id: false })
export class ProductItem {
  @Prop({ type: String, enum: ProductItemType, required: true })
  type: ProductItemType;

  @Prop({ type: Types.ObjectId, ref: 'Ingredient', default: null, index: true })
  ingredientId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Preparation', default: null, index: true })
  preparationId?: Types.ObjectId | null;

  // cantidad usada (en unidad del ingrediente / preparación)
  @Prop({ type: Number, required: true, min: 0 })
  qty: number;

  @Prop({ type: String, default: null, trim: true })
  note?: string | null;
}

@Schema({ _id: false })
export class ProductComputed {
  @Prop({ type: Number, default: 0 })
  ingredientsCost: number;

  // ingredientsCost + extras (packaging + extraCost) + merma
  @Prop({ type: Number, default: 0 })
  totalCost: number;

  // totalCost / yieldQty
  @Prop({ type: Number, default: 0 })
  unitCost: number;

  // sugerido por margen si salePrice no se setea
  @Prop({ type: Number, default: null })
  suggestedPrice?: number | null;

  // margen usado para suggestedPrice (0..1)
  @Prop({ type: Number, default: null })
  marginPctUsed?: number | null;

  // margen bruto real si existe salePrice ( (salePrice - unitCost)/salePrice )
  @Prop({ type: Number, default: null })
  grossMarginPct?: number | null;

  @Prop({ type: String, default: 'ARS' })
  currency: 'ARS' | 'USD';

  @Prop({ type: Date, default: null })
  computedAt?: Date | null;
}

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: null, trim: true })
  description?: string | null;

  // Multi-sucursal (opcional)
  @Prop({ type: Types.ObjectId, ref: 'Branch', default: null, index: true })
  branchId?: Types.ObjectId | null;

  // Opcional: si querés agrupar por proveedor (no obligatorio en “vendibles”)
  @Prop({ type: Types.ObjectId, ref: 'Supplier', default: null, index: true })
  supplierId?: Types.ObjectId | null;

  // Categoría (podés usar una colección Category o solo texto)
  @Prop({ type: Types.ObjectId, ref: 'Category', default: null, index: true })
  categoryId?: Types.ObjectId | null;

  @Prop({ type: String, default: null, trim: true, index: true })
  categoryName?: string | null;

  // Identificadores comerciales
  @Prop({ type: String, default: null, trim: true, index: true })
  sku?: string | null;

  @Prop({ type: String, default: null, trim: true, index: true })
  barcode?: string | null;

  // Producto vendible / se produce internamente
  @Prop({ type: Boolean, default: true, index: true })
  isSellable: boolean;

  @Prop({ type: Boolean, default: true, index: true })
  isProduced: boolean;

  // Rendimiento “vendible”
  @Prop({ type: Number, required: true, min: 0.000001, default: 1 })
  yieldQty: number;

  @Prop({ type: String, enum: Unit, required: true, default: Unit.UNIT })
  yieldUnit: Unit;

  // Ej: 8 piezas
  @Prop({ type: Number, default: null, min: 0 })
  portionSize?: number | null;

  @Prop({ type: String, default: null, trim: true })
  portionLabel?: string | null; // ej “piezas”, “unidades”, “g”

  // merma de armado: 0..1
  @Prop({ type: Number, default: 0, min: 0, max: 1 })
  wastePct: number;

  // costos extra (mano de obra estimada, gas, etc)
  @Prop({ type: Number, default: 0, min: 0 })
  extraCost: number;

  // packaging separado
  @Prop({ type: Number, default: 0, min: 0 })
  packagingCost: number;

  @Prop({ type: String, default: 'ARS' })
  currency: 'ARS' | 'USD';

  // precio de venta manual (por yieldUnit)
  @Prop({ type: Number, default: null, min: 0 })
  salePrice?: number | null;

  // margen deseado (0..1). Si salePrice null, se usa para suggestedPrice
  @Prop({ type: Number, default: null, min: 0, max: 1 })
  marginPct?: number | null;

  @Prop({ type: [ProductItem], default: [] })
  items: ProductItem[];

  @Prop({ type: [String], default: [], index: true })
  tags: string[];

  @Prop({ type: [String], enum: Allergen, default: [], index: true })
  allergens: Allergen[];

  @Prop({ type: String, default: null, trim: true })
  imageUrl?: string | null;

  @Prop({ type: [String], default: [] })
  galleryUrls: string[];

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: ProductComputed, default: {} })
  computed: ProductComputed;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Evitar duplicados por branch/supplier (si es null, sparse evita romper)
ProductSchema.index({ branchId: 1, supplierId: 1, name: 1 }, { unique: true, sparse: true });

// SKU / barcode únicos si existen
ProductSchema.index({ sku: 1 }, { unique: true, sparse: true });
ProductSchema.index({ barcode: 1 }, { unique: true, sparse: true });
