import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true })
  name: string;

  // Multi-sucursal opcional (si null = global)
  @Prop({ type: Types.ObjectId, ref: 'Branch', default: null, index: true })
  branchId?: Types.ObjectId | null;

  @Prop({ type: String, default: null, trim: true })
  description?: string | null;

  @Prop({ type: String, default: null, trim: true })
  imageUrl?: string | null;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Number, default: 0 })
  sortOrder: number;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// Evita duplicados por branch (si branchId null, sparse permite globales)
CategorySchema.index({ branchId: 1, name: 1 }, { unique: true, sparse: true });
CategorySchema.index({ name: 1 });
CategorySchema.index({ tags: 1 });
