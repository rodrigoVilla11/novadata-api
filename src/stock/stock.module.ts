// src/stock/stock.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockMovement, StockMovementSchema } from './schemas/stock-movement.schema';

import { Ingredient } from 'src/ingredients/schemas/ingredients.schema';
import { RecipeModule } from 'src/recipes/recipe.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockMovement.name, schema: StockMovementSchema },
      // Para validar unidades / fallback unit cuando en applyManual no viene unit
      { name: Ingredient.name, schema: (Ingredient as any).schema }, // si tu IngredientSchema ya está exportado, reemplazá esta línea
    ]),
    RecipeModule,
  ],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
