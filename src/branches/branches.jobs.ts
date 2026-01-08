import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Branch, BranchDocument, BranchPlan } from "./schemas/branch.schema";

@Injectable()
export class BranchesJobs {
  private readonly logger = new Logger(BranchesJobs.name);

  constructor(
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
  ) {}

  // Corre todos los días a las 03:10
  @Cron("10 3 * * *")
  async disableExpiredFreeBranches() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 días

    // Si planStartedAt no existe en docs viejos, caemos a createdAt
    // (pero como createdAt no siempre está indexado, igual funciona).
    const res = await this.branchModel.updateMany(
      {
        deletedAt: null,
        isActive: true,
        plan: BranchPlan.FREE,
        $or: [
          { planStartedAt: { $lte: cutoff } },
          { planStartedAt: null, createdAt: { $lte: cutoff } },
        ],
      },
      { $set: { isActive: false } },
    );

    if ((res as any).modifiedCount) {
      this.logger.log(`Disabled FREE branches: ${(res as any).modifiedCount}`);
    }
  }
}
