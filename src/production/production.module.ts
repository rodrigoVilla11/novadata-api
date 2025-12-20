import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { ProductionEntry, ProductionSchema } from './schemas/production.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductionEntry.name, schema: ProductionSchema },
    ]),
  ],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
