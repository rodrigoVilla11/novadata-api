import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type TaskDocument = HydratedDocument<Task>;

@Schema({ timestamps: true })
export class Task {
  @Prop({ type: Types.ObjectId, ref: "Branch", required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  // para unicidad y búsquedas case-insensitive
  @Prop({ required: true, trim: true, lowercase: true, index: true })
  nameLower: string;

  @Prop({ type: String, default: null, trim: true })
  area: string | null;

  @Prop({ type: String, default: null, trim: true, lowercase: true, index: true })
  areaLower: string | null;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  // opcional (soft delete)
  @Prop({ type: Date, default: null, index: true })
  deletedAt: Date | null;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

// Unicidad por sucursal (y sin distinguir mayúsculas)
TaskSchema.index(
  { branchId: 1, nameLower: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } } // si no usás soft delete, podés borrar esto
);

// Índices para listados típicos
TaskSchema.index({ branchId: 1, isActive: 1, areaLower: 1 });
