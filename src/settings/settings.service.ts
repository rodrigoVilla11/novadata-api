import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Settings, SettingsDocument, SettingsScope } from "./schemas/settings.schema";

function toObjectId(id?: string | null) {
  if (!id) return null;
  return new Types.ObjectId(id);
}

// Solo pisa valores “definidos” en override
function mergeSettings(base: any, override: any) {
  if (!override) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (
      v !== undefined &&
      k !== "_id" &&
      k !== "scope" &&
      k !== "branchId" &&
      k !== "subBranchId" &&
      k !== "createdAt" &&
      k !== "updatedAt" &&
      k !== "__v"
    ) {
      out[k] = v;
    }
  }
  return out;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name)
    private readonly settingsModel: Model<SettingsDocument>,
  ) {}

  async ensureGlobal() {
    let s = await this.settingsModel.findOne({ scope: "GLOBAL" }).lean();
    if (!s) s = await this.settingsModel.create({ scope: "GLOBAL" }).then(x => x.toObject());
    return s;
  }

  async getGlobal() {
    return this.ensureGlobal();
  }

  async getBranch(branchId: string) {
    const bid = toObjectId(branchId);
    return this.settingsModel.findOne({ scope: "BRANCH", branchId: bid, subBranchId: null }).lean();
  }

  async getSubBranch(branchId: string, subBranchId: string) {
    const bid = toObjectId(branchId);
    const sbid = toObjectId(subBranchId);
    return this.settingsModel.findOne({ scope: "SUBBRANCH", branchId: bid, subBranchId: sbid }).lean();
  }

  /**
   * Settings efectivos:
   * GLOBAL + override BRANCH + override SUBBRANCH
   */
  async getEffective(params: { branchId?: string; subBranchId?: string }) {
    const global = await this.ensureGlobal();

    if (!params.branchId) return global;

    const branch = await this.getBranch(params.branchId);
    let effective = mergeSettings(global, branch);

    if (params.subBranchId) {
      const sub = await this.getSubBranch(params.branchId, params.subBranchId);
      effective = mergeSettings(effective, sub);
    }

    return effective;
  }

  /**
   * Upsert de un scope
   */
  async upsertScope(input: {
    scope: SettingsScope;
    branchId?: string | null;
    subBranchId?: string | null;
    data: Partial<Settings>;
  }) {
    const branchId = toObjectId(input.branchId ?? null);
    const subBranchId = toObjectId(input.subBranchId ?? null);

    const filter: any = {
      scope: input.scope,
      branchId: input.scope === "GLOBAL" ? null : branchId,
      subBranchId: input.scope === "SUBBRANCH" ? subBranchId : null,
    };

    const update = { ...input.data, ...filter };

    const doc = await this.settingsModel.findOneAndUpdate(
      filter,
      { $set: update },
      { new: true, upsert: true },
    );

    return doc.toObject();
  }
}
