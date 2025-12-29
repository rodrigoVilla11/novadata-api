import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { Product, ProductItemType } from "src/products/schemas/product.schema";
import {
  Preparation,
  PrepItemType,
} from "src/preparations/schemas/preparation.schema";
import { Ingredient } from "src/ingredients/schemas/ingredients.schema";
import { Unit } from "src/ingredients/enums/unit.enum";

type IngredientConsumption = {
  ingredientId: string;
  unit: Unit;
  qty: number;
};

type BreakdownRow = {
  source: "PRODUCT_ITEM" | "PREPARATION_ITEM";
  productId?: string;
  preparationId?: string; // la prep “donde estoy parado”
  ingredientId?: string;
  childPreparationId?: string; // si el item era PREPARATION
  unit: Unit;
  qty: number;
  note?: string | null;
};

type RecipeExpandResult = {
  items: IngredientConsumption[];
  breakdown?: BreakdownRow[];
};

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function clampNonNeg(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function addToMap(
  map: Map<string, { ingredientId: string; unit: Unit; qty: number }>,
  ingredientId: string,
  unit: Unit,
  qty: number
) {
  const key = `${ingredientId}::${unit}`;
  const prev = map.get(key);
  if (!prev) map.set(key, { ingredientId, unit, qty });
  else prev.qty += qty;
}

@Injectable()
export class RecipeService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Preparation.name)
    private readonly preparationModel: Model<Preparation>,
    @InjectModel(Ingredient.name)
    private readonly ingredientModel: Model<Ingredient>
  ) {}

  /**
   * Expande un Product (qty unidades vendidas) a consumos finales de ingredientes.
   */
  async expandProductToIngredients(
    productId: string,
    productQty: number,
    opts?: { includeBreakdown?: boolean }
  ): Promise<RecipeExpandResult> {
    const qty = num(productQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException("productQty must be > 0");
    }

    const product = await this.productModel.findById(productId).lean();
    if (!product) throw new NotFoundException("Product not found");

    const items = Array.isArray((product as any).items)
      ? ((product as any).items as any[])
      : [];
    if (!items.length) throw new BadRequestException("Product has no recipe items");

    // precarga ids
    const ingredientIds: Types.ObjectId[] = [];
    const preparationIds: Types.ObjectId[] = [];

    for (const it of items) {
      if (it.type === ProductItemType.INGREDIENT) {
        if (!it.ingredientId)
          throw new BadRequestException("Product item INGREDIENT missing ingredientId");
        ingredientIds.push(it.ingredientId);
      } else if (it.type === ProductItemType.PREPARATION) {
        if (!it.preparationId)
          throw new BadRequestException("Product item PREPARATION missing preparationId");
        preparationIds.push(it.preparationId);
      } else {
        throw new BadRequestException(`Invalid product item type: ${String(it.type)}`);
      }
    }

    const [ings, preps] = await Promise.all([
      ingredientIds.length
        ? this.ingredientModel.find({ _id: { $in: ingredientIds } }).lean()
        : Promise.resolve([]),
      preparationIds.length
        ? this.preparationModel.find({ _id: { $in: preparationIds } }).lean()
        : Promise.resolve([]),
    ]);

    const ingById = new Map<string, any>();
    for (const i of ings as any[]) ingById.set(String(i._id), i);

    const prepById = new Map<string, any>();
    for (const p of preps as any[]) prepById.set(String(p._id), p);

    const consMap = new Map<string, { ingredientId: string; unit: Unit; qty: number }>();
    const breakdown: BreakdownRow[] | undefined = opts?.includeBreakdown ? [] : undefined;

    for (const it of items) {
      const itemQty = num(it.qty);
      if (!Number.isFinite(itemQty) || itemQty <= 0) {
        throw new BadRequestException("Product item qty must be > 0");
      }

      // qty del product multiplica directamente la receta del product
      const scaledQty = itemQty * qty;

      if (it.type === ProductItemType.INGREDIENT) {
        const ing = ingById.get(String(it.ingredientId));
        if (!ing) throw new BadRequestException(`Ingredient not found: ${String(it.ingredientId)}`);

        const unit = ((ing as any).baseUnit ?? (ing as any).unit ?? Unit.UNIT) as Unit;
        addToMap(consMap, String(ing._id), unit, scaledQty);

        if (breakdown) {
          breakdown.push({
            source: "PRODUCT_ITEM",
            productId: String((product as any)._id),
            ingredientId: String(ing._id),
            unit,
            qty: scaledQty,
            note: it.note ?? null,
          });
        }
      }

      if (it.type === ProductItemType.PREPARATION) {
        const prep = prepById.get(String(it.preparationId));
        if (!prep)
          throw new BadRequestException(`Preparation not found: ${String(it.preparationId)}`);

        // scaledQty está en yieldUnit de esa preparación (según tu regla)
        const expanded = await this.expandPreparationToIngredientsInternal(
          String((prep as any)._id),
          scaledQty,
          {
            includeBreakdown: !!breakdown,
            prepStack: new Set<string>(),
          }
        );

        for (const x of expanded.items) {
          addToMap(consMap, x.ingredientId, x.unit, x.qty);
        }

        if (breakdown && expanded.breakdown?.length) {
          breakdown.push(
            ...expanded.breakdown.map((d) => ({
              ...d,
              productId: String((product as any)._id),
            }))
          );
        }
      }
    }

    const outItems: IngredientConsumption[] = Array.from(consMap.values())
      .map((x) => ({
        ingredientId: x.ingredientId,
        unit: x.unit,
        qty: clampNonNeg(x.qty),
      }))
      .filter((x) => x.qty > 0)
      .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));

    return { items: outItems, ...(breakdown ? { breakdown } : {}) };
  }

  /**
   * Expande una Preparation a consumos finales para "useQty" (en yieldUnit).
   */
  async expandPreparationToIngredients(
    preparationId: string,
    useQty: number,
    opts?: { includeBreakdown?: boolean }
  ): Promise<RecipeExpandResult> {
    return this.expandPreparationToIngredientsInternal(preparationId, useQty, {
      includeBreakdown: !!opts?.includeBreakdown,
      prepStack: new Set<string>(),
    });
  }

  // ===================================================================
  // Internal: preparación (batch) -> ingredientes finales
  // ===================================================================
  private async expandPreparationToIngredientsInternal(
    preparationId: string,
    useQtyRaw: number,
    ctx: { includeBreakdown: boolean; prepStack: Set<string> }
  ): Promise<RecipeExpandResult> {
    const useQty = num(useQtyRaw);
    if (!Number.isFinite(useQty) || useQty <= 0) {
      throw new BadRequestException("useQty must be > 0");
    }

    if (ctx.prepStack.has(preparationId)) {
      throw new BadRequestException("Circular preparation reference detected");
    }
    ctx.prepStack.add(preparationId);

    const prep = await this.preparationModel.findById(preparationId).lean();
    if (!prep) throw new NotFoundException("Preparation not found");

    const yieldQty = Math.max(0.000001, num((prep as any).yieldQty ?? 0));
    if (!Number.isFinite(yieldQty) || yieldQty <= 0) {
      throw new BadRequestException("Preparation yieldQty must be > 0");
    }

    const items = Array.isArray((prep as any).items)
      ? ((prep as any).items as any[])
      : [];
    if (!items.length) throw new BadRequestException("Preparation has no items");

    // factor: cuánto del batch representa el useQty
    // items.qty están definidos para el batch completo => se escala por factor
    const factor = useQty / yieldQty;

    // precargar ingredientes y sub-preps
    const ingIds: Types.ObjectId[] = [];
    const subPrepIds: Types.ObjectId[] = [];

    for (const it of items) {
      if (it.type === PrepItemType.INGREDIENT) {
        if (!it.ingredientId)
          throw new BadRequestException("Preparation item INGREDIENT missing ingredientId");
        ingIds.push(it.ingredientId);
      } else if (it.type === PrepItemType.PREPARATION) {
        if (!it.preparationId)
          throw new BadRequestException("Preparation item PREPARATION missing preparationId");
        subPrepIds.push(it.preparationId);
      } else {
        throw new BadRequestException(`Invalid preparation item type: ${String(it.type)}`);
      }
    }

    const [ings, subPreps] = await Promise.all([
      ingIds.length
        ? this.ingredientModel.find({ _id: { $in: ingIds } }).lean()
        : Promise.resolve([]),
      subPrepIds.length
        ? this.preparationModel.find({ _id: { $in: subPrepIds } }).lean()
        : Promise.resolve([]),
    ]);

    const ingById = new Map<string, any>();
    for (const i of ings as any[]) ingById.set(String(i._id), i);

    const subPrepById = new Map<string, any>();
    for (const p of subPreps as any[]) subPrepById.set(String(p._id), p);

    const consMap = new Map<string, { ingredientId: string; unit: Unit; qty: number }>();
    const breakdown: BreakdownRow[] | undefined = ctx.includeBreakdown ? [] : undefined;

    for (const it of items) {
      const itemQty = num(it.qty);
      if (!Number.isFinite(itemQty) || itemQty <= 0) {
        throw new BadRequestException("Preparation item qty must be > 0");
      }

      const scaledItemQty = itemQty * factor; // ✅ escala batch -> porción usada

      if (it.type === PrepItemType.INGREDIENT) {
        const ing = ingById.get(String(it.ingredientId));
        if (!ing) throw new BadRequestException(`Ingredient not found: ${String(it.ingredientId)}`);

        const unit = ((ing as any).baseUnit ?? (ing as any).unit ?? Unit.UNIT) as Unit;
        addToMap(consMap, String(ing._id), unit, scaledItemQty);

        if (breakdown) {
          breakdown.push({
            source: "PREPARATION_ITEM",
            preparationId: String((prep as any)._id),
            ingredientId: String(ing._id),
            unit,
            qty: scaledItemQty,
            note: it.note ?? null,
          });
        }
      }

      if (it.type === PrepItemType.PREPARATION) {
        const child = subPrepById.get(String(it.preparationId));
        if (!child)
          throw new BadRequestException(`Preparation not found: ${String(it.preparationId)}`);

        // scaledItemQty está en yieldUnit del child (según tu schema)
        const childExpanded = await this.expandPreparationToIngredientsInternal(
          String((child as any)._id),
          scaledItemQty,
          ctx // ✅ mantiene el stack para anti-loop
        );

        for (const x of childExpanded.items) {
          addToMap(consMap, x.ingredientId, x.unit, x.qty);
        }

        if (breakdown) {
          breakdown.push({
            source: "PREPARATION_ITEM",
            preparationId: String((prep as any)._id),
            childPreparationId: String((child as any)._id),
            unit: ((child as any).yieldUnit ?? Unit.UNIT) as Unit,
            qty: scaledItemQty,
            note: it.note ?? null,
          });
        }

        if (breakdown && childExpanded.breakdown?.length) {
          breakdown.push(...childExpanded.breakdown);
        }
      }
    }

    ctx.prepStack.delete(preparationId);

    const outItems: IngredientConsumption[] = Array.from(consMap.values())
      .map((x) => ({
        ingredientId: x.ingredientId,
        unit: x.unit,
        qty: clampNonNeg(x.qty),
      }))
      .filter((x) => x.qty > 0)
      .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));

    return { items: outItems, ...(breakdown ? { breakdown } : {}) };
  }
}
