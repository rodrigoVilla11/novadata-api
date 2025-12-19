import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Unit } from '../enums/unit.enum';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: Unit, required: true })
  unit: Unit;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: true, index: true })
  supplierId: Types.ObjectId;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0, min: 0 })
  minQty: number;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Evita duplicados por proveedor (mismo nombre en mismo proveedor)
ProductSchema.index({ supplierId: 1, name: 1 }, { unique: true });
