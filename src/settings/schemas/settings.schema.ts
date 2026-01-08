import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type SettingsDocument = Settings & Document;

export type SettingsScope = "GLOBAL" | "BRANCH" | "SUBBRANCH";

@Schema({ timestamps: true })
export class Settings {
  @Prop({ type: String, enum: ["GLOBAL", "BRANCH", "SUBBRANCH"], index: true, required: true })
  scope!: SettingsScope;

  // null cuando es GLOBAL
  @Prop({ type: Types.ObjectId, ref: "Branch", default: null, index: true })
  branchId!: Types.ObjectId | null;

  // si no tenés colección, lo podés dejar como string
  // si tenés SubBranch/Section, mejor Types.ObjectId ref
  @Prop({ type: Types.ObjectId, ref: "SubBranch", default: null, index: true })
  subBranchId!: Types.ObjectId | null;

  /* =========================
   * CONFIG FIELDS
   * ========================= */

  // GENERAL
  @Prop({ default: "Mi Negocio" })
  businessName!: string;

  @Prop({ default: "ARS" })
  currency!: "ARS" | "USD";

  @Prop({ default: "America/Argentina/Buenos_Aires" })
  timezone!: string;

  // STOCK
  @Prop({ default: true })
  trackStock!: boolean;

  @Prop({ default: false })
  allowNegativeStock!: boolean;

  @Prop({ default: 5 })
  stockAlertDays!: number;

  // POS
  @Prop({ default: true })
  allowManualDiscount!: boolean;

  @Prop({ default: ["CASH", "TRANSFER", "CARD"] })
  paymentMethods!: string[];

  // USERS
  @Prop({ default: false })
  allowUserRegister!: boolean;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);

// 🔒 ÚNICO por scope+branch+subbranch
SettingsSchema.index(
  { scope: 1, branchId: 1, subBranchId: 1 },
  { unique: true, partialFilterExpression: { scope: { $in: ["GLOBAL", "BRANCH", "SUBBRANCH"] } } }
);
