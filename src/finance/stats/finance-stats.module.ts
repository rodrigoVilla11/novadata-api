import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { FinanceStatsController } from "./finance-stats.controller";
import { FinanceStatsService } from "./finance-stats.service";
import { FinanceMovement, FinanceMovementSchema } from "../movements/schemas/finance-movement.schema";
import { FinanceAccountsModule } from "../accounts/finance-accounts.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FinanceMovement.name, schema: FinanceMovementSchema }]),
    FinanceAccountsModule,
  ],
  controllers: [FinanceStatsController],
  providers: [FinanceStatsService],
  exports: [FinanceStatsService],
})
export class FinanceStatsModule {}
