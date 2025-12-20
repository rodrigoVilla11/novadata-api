import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WeeklyMessageDocument = HydratedDocument<WeeklyMessage>;

export type WeeklyMessageType =
  | 'avance'
  | 'error'
  | 'mejora'
  | 'bloqueo'
  | 'decision'
  | 'otro';

@Schema({ timestamps: true })
export class WeeklyMessage {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({ required: true, index: true, trim: true })
  thread_id: string;

  @Prop({ required: true, index: true, trim: true })
  author_id: string;

  @Prop({ type: String, default: null })
  author_email: string | null;

  @Prop({
    type: String,
    enum: ['avance', 'error', 'mejora', 'bloqueo', 'decision', 'otro'],
    default: 'otro',
    index: true,
  })
  type: WeeklyMessageType;

  @Prop({ required: true })
  text: string;

  @Prop({ type: Boolean, default: false, index: true })
  pinned: boolean;

  @Prop({ type: String, default: null })
  task_id: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WeeklyMessageSchema = SchemaFactory.createForClass(WeeklyMessage);

WeeklyMessageSchema.index({ thread_id: 1, createdAt: 1 });
WeeklyMessageSchema.index({ author_id: 1, createdAt: -1 });
