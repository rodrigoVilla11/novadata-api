import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StockSnapshotsController } from "./stock-snapshots.controller";
import { StockSnapshotsService } from "./stock-snapshots.service";
import { StockSnapshot, StockSnapshotSchema } from "./schemas/stock-snapshot.schema";
import { Supplier, SupplierSchema } from "src/suppliers/schemas/supplier.schema";
import { Ingredient, IngredientSchema } from "src/products/schemas/ingredients.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockSnapshot.name, schema: StockSnapshotSchema }]),
    MongooseModule.forFeature([{ name: Ingredient.name, schema: IngredientSchema }]),
    MongooseModule.forFeature([{ name: Supplier.name, schema: SupplierSchema }]),
  ],
  controllers: [StockSnapshotsController],
  providers: [StockSnapshotsService],
})
export class StockSnapshotsModule {}
