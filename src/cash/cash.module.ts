import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CashService } from './cash.service';
import { CashController } from './cash.controller';

import { CashDay, CashDaySchema } from './schemas/cash-day.schema';
import {
  CashMovement,
  CashMovementSchema,
} from './schemas/cash-movement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CashDay.name, schema: CashDaySchema },
      { name: CashMovement.name, schema: CashMovementSchema },
    ]),
  ],
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService], 
})
export class CashModule {}
