import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CashService } from './cash.service';
import { CashController } from './cash.controller';

import { CashDay, CashDaySchema } from './schemas/cash-day.schema';
import {
  CashMovement,
  CashMovementSchema,
} from './schemas/cash-movement.schema';
import { FinanceMovement, FinanceMovementSchema } from 'src/finance/movements/schemas/finance-movement.schema';
import { FinanceDayClosing, FinanceDayClosingSchema } from 'src/finance/closings/schemas/finance-day-closing.schema';
import { FinanceAccountsModule } from 'src/finance/accounts/finance-accounts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CashDay.name, schema: CashDaySchema },
      { name: CashMovement.name, schema: CashMovementSchema },
      { name: FinanceMovement.name, schema: FinanceMovementSchema },
      { name: FinanceDayClosing.name, schema: FinanceDayClosingSchema },
    ]),
    FinanceAccountsModule
  ],
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService], 
})
export class CashModule {}
