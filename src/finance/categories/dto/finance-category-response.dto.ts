import { 
  FinanceCategoryDirection, 
  FinanceCategoryType 
} from "../schemas/finance-category.schema";

export class FinanceCategoryResponseDto {
  id!: string;
  branchId!: string | null;
  code!: string;
  name!: string;
  type!: FinanceCategoryType;
  direction!: FinanceCategoryDirection;
  parentId!: string | null;
  order!: number;
  isActive!: boolean;
  affectsProfit!: boolean;
  includeInStats!: boolean;
  createdByUserId!: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export class FinanceCategoryTreeResponseDto extends FinanceCategoryResponseDto {
  children!: FinanceCategoryTreeResponseDto[];
}