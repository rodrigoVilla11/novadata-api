import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StockSnapshotsController } from "./stock-snapshots.controller";
import { StockSnapshotsService } from "./stock-snapshots.service";
import { StockSnapshot, StockSnapshotSchema } from "./schemas/stock-snapshot.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StockSnapshot.name, schema: StockSnapshotSchema }]),
  ],
  controllers: [StockSnapshotsController],
  providers: [StockSnapshotsService],
})
export class StockSnapshotsModule {}
