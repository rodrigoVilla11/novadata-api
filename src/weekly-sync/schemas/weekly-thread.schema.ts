// weekly-thread.schema.ts
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type WeeklyThreadDocument = HydratedDocument<WeeklyThread>;
export type WeeklyThreadStatus = "open" | "closed";

@Schema({ timestamps: true })
export class WeeklyThread {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  /**
   * Branch (sucursal)
   * Permite multi-branch sin mezclar hilos
   */
  @Prop({ required: true, index: true, trim: true })
  branchId: string;

  // Lunes 00:00
  @Prop({ required: true, index: true })
  week_start: Date;

  // Lunes siguiente 00:00 (recomendado)
  @Prop({ required: true })
  week_end: Date;

  @Prop({
    type: String,
    enum: ["open", "closed"],
    default: "open",
    index: true,
  })
  status: WeeklyThreadStatus;

  @Prop({ required: true, index: true, trim: true })
  created_by: string; // userId

  @Prop({ type: [String], default: [] })
  participants: string[];

  @Prop({ type: String, default: "" })
  summary: string;
}

export const WeeklyThreadSchema =
  SchemaFactory.createForClass(WeeklyThread);

/**
 * Índices
 * - Una semana por branch
 */
WeeklyThreadSchema.index(
  { branchId: 1, week_start: 1 },
  { unique: true },
);
