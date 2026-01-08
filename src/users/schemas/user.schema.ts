import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export type Role =
  | 'SUPERADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'CASHIER'
  | 'USER';

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({
    type: [String],
    enum: ['SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'USER'],
    default: ['USER'],
    index: true,
  })
  roles!: Role[];

  /**
   * Branch a la que pertenece el usuario
   * - SUPERADMIN => null
   * - resto => obligatorio
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'Branch',
    default: null,
    index: true,
  })
  branchId!: Types.ObjectId | null;

  @Prop({
    type: String,
    trim: true,
    default: null,
  })
  username!: string | null;

  @Prop({
    type: String,
    default: null,
  })
  refreshTokenHash!: string | null;

  @Prop({
    type: Boolean,
    default: true,
    index: true,
  })
  isActive!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
