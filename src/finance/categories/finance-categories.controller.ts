import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { RolesGuard } from "src/auth/roles.guard";
import { Roles } from "src/auth/roles.decorator";
import { CurrentUser } from "src/auth/current-user.decorator";
import { FinanceCategoriesService } from "./finance-categories.service";
import { CreateFinanceCategoryDto } from "./dto/create-finance-category.dto";
import { UpdateFinanceCategoryDto } from "./dto/update-finance-category.dto";
import { 
  FinanceCategoryType,
  FinanceCategoryDirection,
} from "./schemas/finance-category.schema";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("finance/categories")
export class FinanceCategoriesController {
  constructor(private readonly service: FinanceCategoriesService) {}

  /**
   * Extrae y valida el branchId del usuario actual
   */
  private getBranchIdOrThrow(user: any): string {
    const branchId = String(user?.branchId || "");
    if (!branchId) {
      throw new BadRequestException("branchId faltante en el usuario");
    }
    return branchId;
  }

  /**
   * Extrae el userId del usuario actual
   */
  private getUserIdOrThrow(user: any): string {
    const userId = String(user?.id || user?.userId || user?._id || "");
    if (!userId) {
      throw new BadRequestException("userId faltante en el usuario");
    }
    return userId;
  }

  /**
   * Valida que el tipo de categoría sea válido
   */
  private validateCategoryType(type?: string): void {
    if (type && !Object.values(FinanceCategoryType).includes(type as FinanceCategoryType)) {
      throw new BadRequestException(
        `Tipo inválido. Debe ser: ${Object.values(FinanceCategoryType).join(", ")}`
      );
    }
  }

  /**
   * Valida que la dirección de categoría sea válida
   */
  private validateCategoryDirection(direction?: string): void {
    if (direction && !Object.values(FinanceCategoryDirection).includes(direction as FinanceCategoryDirection)) {
      throw new BadRequestException(
        `Dirección inválida. Debe ser: ${Object.values(FinanceCategoryDirection).join(", ")}`
      );
    }
  }

  /**
   * Parsea el parámetro 'active' de query string a boolean
   */
  private parseActiveParam(active?: string): boolean | undefined {
    if (active === undefined) return undefined;
    if (active === "true") return true;
    if (active === "false") return false;
    return undefined;
  }

  /**
   * Parsea el parámetro 'parentId' de query string
   * "null" o "" => null (raíces)
   * undefined => undefined (sin filtro)
   * valor => valor
   */
  private parseParentIdParam(parentId?: string): string | null | undefined {
    if (parentId === undefined) return undefined;
    if (parentId === "null" || parentId === "") return null;
    return parentId;
  }

  /**
   * Parsea parámetros booleanos genéricos
   */
  private parseBooleanParam(value?: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  }

  @Get()
  @Roles("ADMIN", "CASHIER")
  async list(
    @CurrentUser() user: any,
    @Query("type") type?: string,
    @Query("direction") direction?: string,
    @Query("active") active?: string,
    @Query("parentId") parentId?: string,
    @Query("includeInStats") includeInStats?: string,
    @Query("affectsProfit") affectsProfit?: string,
    @Query("q") q?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(user);

    // Validar tipo y dirección si se proporcionan
    this.validateCategoryType(type);
    this.validateCategoryDirection(direction);

    const activeBool = this.parseActiveParam(active);
    const parsedParentId = this.parseParentIdParam(parentId);
    const includeInStatsBool = this.parseBooleanParam(includeInStats);
    const affectsProfitBool = this.parseBooleanParam(affectsProfit);

    return this.service.findAll({
      branchId,
      type: type as FinanceCategoryType,
      direction: direction as FinanceCategoryDirection,
      active: activeBool,
      parentId: parsedParentId,
      includeInStats: includeInStatsBool,
      affectsProfit: affectsProfitBool,
      q: q?.trim() || undefined,
      includeDeleted: false,
    });
  }

  @Get("tree")
  @Roles("ADMIN", "CASHIER")
  async getTree(
    @CurrentUser() user: any,
    @Query("direction") direction?: string,
    @Query("type") type?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(user);

    // Validar dirección y tipo si se proporcionan
    this.validateCategoryDirection(direction);
    this.validateCategoryType(type);

    const activeOnlyBool = this.parseBooleanParam(activeOnly);

    return this.service.getTree({
      branchId,
      direction: direction as FinanceCategoryDirection,
      type: type as FinanceCategoryType,
      activeOnly: activeOnlyBool ?? true, // Por defecto solo activas
    });
  }

  @Get(":id")
  @Roles("ADMIN", "CASHIER")
  async getOne(
    @CurrentUser() user: any,
    @Param("id") id: string,
  ) {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException("ID de categoría es requerido");
    }

    return this.service.findOne({ branchId, id: id.trim() });
  }

  @Post()
  @Roles("ADMIN")
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateFinanceCategoryDto,
  ) {
    const branchId = this.getBranchIdOrThrow(user);
    const userId = this.getUserIdOrThrow(user);

    return this.service.create({ userId, branchId, dto });
  }

  @Patch(":id")
  @Roles("ADMIN")
  async update(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() dto: UpdateFinanceCategoryDto,
  ) {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException("ID de categoría es requerido");
    }

    // Validar que el DTO no esté vacío
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException("Debe proporcionar al menos un campo para actualizar");
    }

    return this.service.update({ branchId, id: id.trim(), dto });
  }

  @Post(":id/archive")
  @Roles("ADMIN")
  async archive(
    @CurrentUser() user: any,
    @Param("id") id: string,
  ) {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException("ID de categoría es requerido");
    }

    return this.service.archive({ branchId, id: id.trim() });
  }

  @Post(":id/restore")
  @Roles("ADMIN")
  async restore(
    @CurrentUser() user: any,
    @Param("id") id: string,
  ) {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException("ID de categoría es requerido");
    }

    return this.service.restore({ branchId, id: id.trim() });
  }

  @Post(":id/delete")
  @Roles("ADMIN")
  async softDelete(
    @CurrentUser() user: any,
    @Param("id") id: string,
  ) {
    const branchId = this.getBranchIdOrThrow(user);

    if (!id?.trim()) {
      throw new BadRequestException("ID de categoría es requerido");
    }

    return this.service.softDelete({ branchId, id: id.trim() });
  }
}