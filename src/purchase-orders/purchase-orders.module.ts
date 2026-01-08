import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { PurchaseOrder, PurchaseOrderSchema } from "./schemas/purchase-order.schema";
import { Supplier, SupplierSchema } from "src/suppliers/schemas/supplier.schema";
import { Ingredient, IngredientSchema } from "src/ingredients/schemas/ingredients.schema";
import { StockModule } from "src/stock/stock.module"; // ✅ si usás StockService

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Ingredient.name, schema: IngredientSchema },
    ]),
    StockModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
