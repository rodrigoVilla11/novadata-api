import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type TaskDocument = HydratedDocument<Task>;

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: null, trim: true })
  area: string | null;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({ name: 1 }, { unique: true });
TaskSchema.index({ area: 1 });
TaskSchema.index({ isActive: 1 });
