import { Unit } from "src/ingredients/enums/unit.enum";

export type IngredientConsumption = {
  ingredientId: string;
  unit: Unit;
  qty: number;
};

export type RecipeExpandResult = {
  items: IngredientConsumption[]; // consolidado
  breakdown?: Array<{
    source: "PRODUCT_ITEM" | "PREPARATION_ITEM";
    productId?: string;
    preparationId?: string;
    ingredientId: string;
    unit: Unit;
    qty: number;
    note?: string | null;
  }>;
};
