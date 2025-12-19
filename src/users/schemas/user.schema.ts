import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;
export type Role = 'USER' | 'ADMIN' | 'MANAGER';

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ required: true })
  passwordHash: string;
  
  @Prop({
    type: [String],
    enum: ['ADMIN', 'MANAGER', 'USER'],
    default: ['USER'],
  })
  roles: Role[];

  @Prop({ type: String, default: null })
  refreshTokenHash: string | null;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
