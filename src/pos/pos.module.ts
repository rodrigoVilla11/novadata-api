// src/pos/pos.module.ts
import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { OrdersModule } from 'src/orders/orders.module';
import { SalesModule } from 'src/sales/sales.module';

@Module({
  imports: [OrdersModule, SalesModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
