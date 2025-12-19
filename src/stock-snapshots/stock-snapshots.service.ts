import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { StockSnapshot } from "./schemas/stock-snapshot.schema";

function assertDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException("Invalid dateKey format. Use YYYY-MM-DD");
  }
}

@Injectable()
export class StockSnapshotsService {
  constructor(
    @InjectModel(StockSnapshot.name) private snapshotModel: Model<StockSnapshot>,
  ) {}

  async getOne(params: { dateKey: string; supplierId: string }) {
    assertDateKey(params.dateKey);

    const doc = await this.snapshotModel
      .findOne({
        dateKey: params.dateKey,
        supplierId: new Types.ObjectId(params.supplierId),
      })
      .lean();

    if (!doc) return null;

    return {
      id: String((doc as any)._id),
      dateKey: doc.dateKey,
      supplierId: String((doc as any).supplierId),
      items: (doc.items || []).map((it: any) => ({
        productId: String(it.productId),
        qty: it.qty,
      })),
      createdAt: (doc as any).createdAt,
      updatedAt: (doc as any).updatedAt,
    };
  }

  async upsert(input: {
    dateKey: string;
    supplierId: string;
    items: { productId: string; qty: number }[];
    createdBy?: string | null;
  }) {
    assertDateKey(input.dateKey);

    const supplierObjectId = new Types.ObjectId(input.supplierId);

    const items = (input.items || []).map((it) => ({
      productId: new Types.ObjectId(it.productId),
      qty: Number(it.qty),
    }));

    const doc = await this.snapshotModel.findOneAndUpdate(
      { dateKey: input.dateKey, supplierId: supplierObjectId },
      {
        $set: {
          dateKey: input.dateKey,
          supplierId: supplierObjectId,
          items,
          ...(input.createdBy ? { createdBy: new Types.ObjectId(input.createdBy) } : {}),
        },
      },
      { upsert: true, new: true },
    );

    return {
      id: String((doc as any)._id),
      dateKey: doc.dateKey,
      supplierId: String((doc as any).supplierId),
      items: (doc.items || []).map((it: any) => ({
        productId: String(it.productId),
        qty: it.qty,
      })),
      updatedAt: (doc as any).updatedAt,
    };
  }
}
