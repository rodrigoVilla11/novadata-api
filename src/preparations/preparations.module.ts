// src/preparations/preparations.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PreparationsController } from './preparations.controller';
import { PreparationsService } from './preparations.service';
import { Preparation, PreparationSchema } from './schemas/preparation.schema';

import { Ingredient, IngredientSchema } from '../ingredients/schemas/ingredients.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Preparation.name, schema: PreparationSchema },
      { name: Ingredient.name, schema: IngredientSchema },
    ]),
  ],
  controllers: [PreparationsController],
  providers: [PreparationsService],
  exports: [PreparationsService],
})
export class PreparationsModule {}
