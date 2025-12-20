import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StockSnapshotsController } from "./stock-snapshots.controller";
import { StockSnapshotsService } from "./stock-snapshots.service";
import { StockSnapshot, StockSnapshotSchema } from "./schemas/stock-snapshot.schema";
import { Product, ProductSchema } from "src/products/schemas/product.schema";
import { Supplier, SupplierSchema } from "src/suppliers/schemas/supplier.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockSnapshot.name, schema: StockSnapshotSchema }]),
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    MongooseModule.forFeature([{ name: Supplier.name, schema: SupplierSchema }]),
  ],
  controllers: [StockSnapshotsController],
  providers: [StockSnapshotsService],
})
export class StockSnapshotsModule {}
