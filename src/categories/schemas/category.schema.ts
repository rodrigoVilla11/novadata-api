import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true })
  name: string;

  // ✅ Obligatorio: siempre pertenece a una sucursal
  @Prop({
    type: Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true,
  })
  branchId: Types.ObjectId;

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

// ✅ Unicidad por branch: mismo name NO se repite dentro del mismo branchId
CategorySchema.index({ branchId: 1, name: 1 }, { unique: true });

CategorySchema.index({ name: 1 });
CategorySchema.index({ tags: 1 });
