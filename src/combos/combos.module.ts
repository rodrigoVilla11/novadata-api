import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CombosController } from "./combos.controller";
import { CombosService } from "./combos.service";
import { Combo, ComboSchema } from "./schemas/combo.schema";
import { Product, ProductSchema } from "../products/schemas/product.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Combo.name, schema: ComboSchema },
      { name: Product.name, schema: ProductSchema }, // para validar + pricing
    ]),
  ],
  controllers: [CombosController],
  providers: [CombosService],
  exports: [CombosService],
})
export class CombosModule {}
