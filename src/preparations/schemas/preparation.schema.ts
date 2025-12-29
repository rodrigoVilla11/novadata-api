// src/preparations/schemas/preparation.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Unit } from '../../ingredients/enums/unit.enum';

export type PreparationDocument = HydratedDocument<Preparation>;

export enum PrepItemType {
  INGREDIENT = 'INGREDIENT',
  PREPARATION = 'PREPARATION',
}

@Schema({ _id: false })
export class PreparationItem {
  @Prop({ type: String, enum: PrepItemType, required: true })
  type: PrepItemType;

  // Uno u otro según "type"
  @Prop({ type: Types.ObjectId, ref: 'Ingredient', default: null, index: true })
  ingredientId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Preparation', default: null, index: true })
  preparationId?: Types.ObjectId | null;

  // Cantidad en la unidad base del “ítem”
  // - si type=INGREDIENT: qty está en ingredient.baseUnit
  // - si type=PREPARATION: qty está en preparation.yieldUnit (o sea, en la “unidad de salida” de esa prep)
  @Prop({ type: Number, required: true, min: 0 })
  qty: number;

  @Prop({ type: String, trim: true, default: null })
  note?: string | null;
}

@Schema({ _id: false })
export class PreparationComputed {
  @Prop({ type: Number, default: 0 })
  ingredientsCost: number;

  @Prop({ type: Number, default: 0 })
  totalCost: number;

  @Prop({ type: Number, default: 0 })
  unitCost: number;

  @Prop({ type: String, default: 'ARS' })
  currency: 'ARS' | 'USD';

  @Prop({ type: Date, default: null })
  computedAt?: Date | null;
}

@Schema({ timestamps: true })
export class Preparation {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, trim: true, default: null })
  description?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', default: null, index: true })
  supplierId?: Types.ObjectId | null;

  @Prop({ type: [PreparationItem], default: [] })
  items: PreparationItem[];

  @Prop({ type: Number, required: true, min: 0 })
  yieldQty: number;

  @Prop({ type: String, enum: Unit, required: true })
  yieldUnit: Unit;

  @Prop({ type: Number, default: 0, min: 0, max: 1 })
  wastePct: number;

  @Prop({ type: Number, default: 0, min: 0 })
  extraCost: number;

  @Prop({ type: String, default: 'ARS' })
  currency: 'ARS' | 'USD';

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: PreparationComputed, default: () => ({}) })
  computed: PreparationComputed;
}

export const PreparationSchema = SchemaFactory.createForClass(Preparation);
PreparationSchema.index({ name: 1 }, { unique: true });
