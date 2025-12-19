import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product } from './schemas/product.schema';
import { Unit } from './enums/unit.enum';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<Product>,
  ) {}

  async create(input: { name: string; unit: Unit; supplierId: string }) {
    const name = input.name.trim();
    const supplierObjectId = new Types.ObjectId(input.supplierId);

    try {
      const doc = await this.productModel.create({
        name,
        unit: input.unit,
        supplierId: supplierObjectId,
      });

      return {
        id: String((doc as any)._id),
        name: doc.name,
        unit: doc.unit,
        supplierId: String(doc.supplierId as any),
        isActive: doc.isActive,
        minQty: doc.minQty ?? 0,
      };
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException('Product already exists for this supplier');
      throw e;
    }
  }

  async findAll(params?: { supplierId?: string }) {
    const filter: any = {};
    if (params?.supplierId)
      filter.supplierId = new Types.ObjectId(params.supplierId);

    const items = await this.productModel.find(filter).sort({ name: 1 }).lean();

    return items.map((p: any) => ({
      id: String(p._id),
      name: p.name,
      unit: p.unit,
      supplierId: String(p.supplierId),
      isActive: p.isActive ?? true,
      minQty: p.minQty ?? 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  async setActive(id: string, isActive: boolean) {
    const doc = await this.productModel.findByIdAndUpdate(
      id,
      { isActive },
      { new: true },
    );
    if (!doc) return null;

    return {
      id: String((doc as any)._id),
      name: doc.name,
      unit: doc.unit,
      supplierId: String(doc.supplierId as any),
      isActive: doc.isActive,
    };
  }

  async setMinQty(id: string, minQty: number) {
    const qty = Math.max(0, Number(minQty));
    const doc = await this.productModel.findByIdAndUpdate(
      id,
      { minQty: qty },
      { new: true },
    );
    if (!doc) return null;

    return {
      id: String((doc as any)._id),
      name: doc.name,
      unit: doc.unit,
      supplierId: String(doc.supplierId as any),
      isActive: doc.isActive,
      minQty: (doc as any).minQty ?? 0,
    };
  }
}
