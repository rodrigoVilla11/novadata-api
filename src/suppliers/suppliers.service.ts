import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Supplier } from './schemas/supplier.schema';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<Supplier>,
  ) {}

  async create(name: string) {
    const clean = name.trim();
    try {
      const doc = await this.supplierModel.create({ name: clean });
      return {
        id: String((doc as any)._id),
        name: doc.name,
        isActive: doc.isActive,
      };
    } catch (e: any) {
      if (e?.code === 11000)
        throw new ConflictException('Supplier already exists');
      throw e;
    }
  }

  async findAll() {
    const items = await this.supplierModel.find({}).sort({ name: 1 }).lean();

    return items.map((s: any) => ({
      id: String(s._id),
      name: s.name,
      isActive: s.isActive ?? true,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async setActive(id: string, isActive: boolean) {
    const doc = await this.supplierModel.findByIdAndUpdate(
      id,
      { isActive },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Supplier not found');
    return {
      id: String((doc as any)._id),
      name: doc.name,
      isActive: doc.isActive,
    };
  }
}
