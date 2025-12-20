import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { FinanceDayClosing, FinanceDayClosingSchema } from "./schemas/finance-day-closing.schema";
import { FinanceClosingsService } from "./finance-closings.service";
import { FinanceClosingsController } from "./finance-closings.controller";
import { FinanceAccountsModule } from "../accounts/finance-accounts.module";
import { FinanceMovementsModule } from "../movements/finance-movements.module";
import { FinanceMovement, FinanceMovementSchema } from "../movements/schemas/finance-movement.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FinanceDayClosing.name, schema: FinanceDayClosingSchema }]),
    // necesitamos el model de movements para aggregate
    MongooseModule.forFeature([{ name: FinanceMovement.name, schema: FinanceMovementSchema }]),
    FinanceAccountsModule,
    FinanceMovementsModule,
  ],
  controllers: [FinanceClosingsController],
  providers: [FinanceClosingsService],
  exports: [FinanceClosingsService],
})
export class FinanceClosingsModule {}
