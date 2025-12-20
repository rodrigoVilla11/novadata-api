import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FinanceMovement,
  FinanceMovementSchema,
} from './schemas/finance-movement.schema';
import { FinanceMovementsService } from './finance-movements.service';
import { FinanceMovementsController } from './finance-movements.controller';
import { FinanceAccountsModule } from '../accounts/finance-accounts.module';
import { FinanceCategoriesModule } from '../categories/finance-categories.module';
import { FinanceDayClosing, FinanceDayClosingSchema } from '../closings/schemas/finance-day-closing.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FinanceMovement.name, schema: FinanceMovementSchema },
      { name: FinanceDayClosing.name, schema: FinanceDayClosingSchema },
    ]),

    FinanceAccountsModule,
    FinanceCategoriesModule,
  ],
  controllers: [FinanceMovementsController],
  providers: [FinanceMovementsService],
  exports: [FinanceMovementsService],
})
export class FinanceMovementsModule {}
