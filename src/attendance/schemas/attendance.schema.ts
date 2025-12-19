import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type AttendanceDocument = HydratedDocument<AttendanceRecord>;

@Schema({ timestamps: true })
export class AttendanceRecord {
  @Prop({ required: true, trim: true })
  dateKey: string; // YYYY-MM-DD

  @Prop({ type: Types.ObjectId, ref: "Employee", required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({ type: Date, default: null })
  checkInAt: Date | null;

  @Prop({ type: String, default: null })
  checkInPhotoUrl: string | null;

  @Prop({ type: Date, default: null })
  checkOutAt: Date | null;

  @Prop({ type: String, default: null })
  checkOutPhotoUrl: string | null;

  @Prop({ type: Types.ObjectId, ref: "User", default: null })
  createdBy: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  notes: string | null;
}

export const AttendanceSchema = SchemaFactory.createForClass(AttendanceRecord);
AttendanceSchema.index({ dateKey: 1, employeeId: 1 }, { unique: true });
AttendanceSchema.index({ employeeId: 1, dateKey: 1 });
