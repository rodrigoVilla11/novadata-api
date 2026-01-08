// src/stock/stock.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StockController } from './stock.controller';
import { StockService } from './stock.service';

import { StockMovement, StockMovementSchema } from './schemas/stock-movement.schema';

import { Ingredient, IngredientSchema } from 'src/ingredients/schemas/ingredients.schema';
import { RecipeModule } from 'src/recipes/recipe.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Ingredient.name, schema: IngredientSchema },
    ]),
    RecipeModule, // ✅ para inyectar RecipeService
  ],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
