import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmployeeDocument = HydratedDocument<Employee>;

@Schema({ timestamps: true })
export class Employee {
  // ✅ scoping
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ type: Date, required: true })
  hireDate!: Date;

  @Prop({ type: Number, required: true, min: 0 })
  hourlyRate!: number;

  // opcional: vincular a un user (para login/auto check-in)
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  userId!: Types.ObjectId | null;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

/**
 * 1 user -> 1 employee (si lo usás). sparse = permite null sin chocar
 */
EmployeeSchema.index({ userId: 1 }, { unique: true, sparse: true });

/**
 * ✅ Evitar duplicados por branch (opcional pero muy útil):
 * mismo nombre + misma branch = único (case-insensitive no lo garantiza, pero ayuda)
 */
EmployeeSchema.index(
  { branchId: 1, fullName: 1 },
  { unique: true, partialFilterExpression: { isActive: { $in: [true, false] } } },
);
