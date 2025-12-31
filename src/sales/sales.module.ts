import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

import { Sale, SaleSchema } from './schemas/sale.schema';
import { Order } from 'src/orders/schemas/order.schema';
import { OrderSchema } from 'src/orders/schemas/order.schema';

import { CashModule } from 'src/cash/cash.module';

// Ajustá el path si tu módulo se llama distinto
import { StockModule } from 'src/stock/stock.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    CashModule,
    StockModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
