import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StockSnapshot } from './schemas/stock-snapshot.schema';
import {
  Supplier,
  SupplierDocument,
} from 'src/suppliers/schemas/supplier.schema';
import { Ingredient } from 'src/products/schemas/ingredients.schema';

function assertDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new BadRequestException('Invalid dateKey format. Use YYYY-MM-DD');
  }
}
function isValidDateKey(s: string) {
  // YYYY-MM-DD estricto
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type StockAlert = {
  productId: string;
  name: string;
  providerId: string | null;
  providerName: string | null;
  unit: string | null;
  qty: number | null;
  minQty: number | null;
  status: 'LOW' | 'NO_COUNT';
};

@Injectable()
export class StockSnapshotsService {
  constructor(
    @InjectModel(StockSnapshot.name)
    private snapshotModel: Model<StockSnapshot>,
    @InjectModel(Ingredient.name)
    private readonly ingredientModel: Model<Ingredient>,
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
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
          ...(input.createdBy
            ? { createdBy: new Types.ObjectId(input.createdBy) }
            : {}),
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

  async getAlerts(input: { dateKey?: string }): Promise<StockAlert[]> {
    const dateKey = input.dateKey?.trim();
    if (!dateKey || !isValidDateKey(dateKey)) {
      throw new BadRequestException('dateKey inválido (usar YYYY-MM-DD)');
    }

    // 1) Traemos el conteo del día (si existe)
    // Asumo un doc por día con arraystockRecordModel items: [{ productId, qty }]
    const day = await this.snapshotModel.findOne({ dateKey }).lean();

    const qtyByProduct = new Map<string, number>();
    if (day?.items?.length) {
      for (const it of day.items) {
        const pid = String(it.productId);
        const qty = Number(it.qty);
        if (!Number.isNaN(qty)) qtyByProduct.set(pid, qty);
      }
    }

    // 2) Traemos productos que tengan minQty definido (para alertas)
    // Ajustá “isActive/hidden/deleted_at” según tu schema
    const products = await this.ingredientModel
      .find({
        // si tenés soft delete, filtralo acá
        minQty: { $ne: null },
      })
      .select({ name: 1, providerId: 1, unit: 1, minQty: 1 })
      .lean();

    // 3) Resolver providerName sin N+1: juntamos ids y consultamos 1 vez
    const providerIds = Array.from(
      new Set(
        products
          .map((p: any) => p.providerId)
          .filter(Boolean)
          .map((x: any) => String(x)),
      ),
    );

    const providers = providerIds.length
      ? await this.supplierModel
          .find({
            _id: { $in: providerIds.map((id) => new Types.ObjectId(id)) },
          })
          .select({ name: 1 })
          .lean()
      : [];

    const providerNameById = new Map<string, string>();
    for (const pr of providers)
      providerNameById.set(String(pr._id), pr.name ?? String(pr._id));

    // 4) Construimos alertas
    const alerts: StockAlert[] = [];

    for (const p of products as any[]) {
      const productId = String(p._id);
      const minQty = p.minQty == null ? null : Number(p.minQty);
      const qty = qtyByProduct.has(productId)
        ? qtyByProduct.get(productId)!
        : null;

      // Si no hay conteo del día para ese producto:
      if (qty === null) {
        alerts.push({
          productId,
          name: p.name ?? 'Sin nombre',
          providerId: p.providerId ? String(p.providerId) : null,
          providerName: p.providerId
            ? (providerNameById.get(String(p.providerId)) ?? null)
            : null,
          unit: p.unit ?? null,
          qty: null,
          minQty,
          status: 'NO_COUNT',
        });
        continue;
      }

      // Si hay minQty y qty < minQty -> LOW
      if (minQty != null && qty < minQty) {
        alerts.push({
          productId,
          name: p.name ?? 'Sin nombre',
          providerId: p.providerId ? String(p.providerId) : null,
          providerName: p.providerId
            ? (providerNameById.get(String(p.providerId)) ?? null)
            : null,
          unit: p.unit ?? null,
          qty,
          minQty,
          status: 'LOW',
        });
      }
    }

    // Orden: primero LOW, luego NO_COUNT, y dentro por provider/name
    alerts.sort((a, b) => {
      const order = (s: StockAlert['status']) => (s === 'LOW' ? 0 : 1);
      const d = order(a.status) - order(b.status);
      if (d !== 0) return d;
      const pa = (a.providerName ?? a.providerId ?? '').toLowerCase();
      const pb = (b.providerName ?? b.providerId ?? '').toLowerCase();
      if (pa !== pb) return pa.localeCompare(pb);
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    return alerts;
  }
}
