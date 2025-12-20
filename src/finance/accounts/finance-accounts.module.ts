import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { FinanceAccount, FinanceAccountSchema } from "./schemas/finance-account.schema";
import { FinanceAccountsService } from "./finance-accounts.service";
import { FinanceAccountsController } from "./finance-accounts.controller";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FinanceAccount.name, schema: FinanceAccountSchema }]),
  ],
  controllers: [FinanceAccountsController],
  providers: [FinanceAccountsService],
  exports: [FinanceAccountsService],
})
export class FinanceAccountsModule {}
