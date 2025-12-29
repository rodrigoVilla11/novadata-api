import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { RecipeService } from "./recipe.service";

import { Product, ProductSchema } from "src/products/schemas/product.schema";
import { Preparation, PreparationSchema } from "src/preparations/schemas/preparation.schema";
import { Ingredient, IngredientSchema } from "src/ingredients/schemas/ingredients.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Preparation.name, schema: PreparationSchema },
      { name: Ingredient.name, schema: IngredientSchema },
    ]),
  ],
  providers: [RecipeService],
  exports: [RecipeService],
})
export class RecipeModule {}
