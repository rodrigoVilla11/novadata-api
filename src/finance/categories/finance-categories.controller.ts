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
import { Roles } from "src/auth/roles.decorator";
import { CurrentUser } from "src/auth/current-user.decorator";
import { FinanceCategoriesService } from "./finance-categories.service";
import { CreateFinanceCategoryDto } from "./dto/create-finance-category.dto";
import { UpdateFinanceCategoryDto } from "./dto/update-finance-category.dto";
import { FinanceCategoryType } from "./schemas/finance-category.schema";

@UseGuards(JwtAuthGuard)
@Controller("finance/categories")
export class FinanceCategoriesController {
  constructor(private readonly service: FinanceCategoriesService) {}

  private getBranchIdOrThrow(u: any) {
    const branchId = String(u?.branchId || "");
    if (!branchId) throw new BadRequestException("branchId faltante en el usuario");
    return branchId;
  }

  private getUserId(u: any) {
    return String(u?.id || u?.userId || u?._id || "");
  }

  @Get()
  @Roles("ADMIN", "CASHIER")
  list(
    @CurrentUser() u: any,
    @Query("type") type?: FinanceCategoryType,
    @Query("active") active?: string,
    @Query("parentId") parentId?: string,
    @Query("q") q?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(u);

    const activeBool =
      active === undefined
        ? true
        : active === "true"
          ? true
          : active === "false"
            ? false
            : true;

    // parentId="null" => parentId=null (padres)
    const parsedParentId =
      parentId === undefined ? undefined : parentId === "null" ? null : parentId;

    return this.service.findAll({
      branchId,
      type,
      active: activeBool,
      parentId: parsedParentId,
      q,
      includeDeleted: false,
    });
  }

  @Get(":id")
  @Roles("ADMIN", "CASHIER")
  getOne(@CurrentUser() u: any, @Param("id") id: string) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.findOne({ branchId, id });
  }

  @Post()
  @Roles("ADMIN")
  create(@CurrentUser() u: any, @Body() dto: CreateFinanceCategoryDto) {
    const branchId = this.getBranchIdOrThrow(u);
    const userId = this.getUserId(u);
    if (!userId) throw new BadRequestException("userId faltante en el usuario");

    return this.service.create({ userId, branchId, dto });
  }

  @Patch(":id")
  @Roles("ADMIN")
  update(@CurrentUser() u: any, @Param("id") id: string, @Body() dto: UpdateFinanceCategoryDto) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.update({ branchId, id, dto });
  }

  @Post(":id/archive")
  @Roles("ADMIN")
  archive(@CurrentUser() u: any, @Param("id") id: string) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.archive({ branchId, id });
  }

  @Post(":id/restore")
  @Roles("ADMIN")
  restore(@CurrentUser() u: any, @Param("id") id: string) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.restore({ branchId, id });
  }

  // soft-delete real
  @Post(":id/delete")
  @Roles("ADMIN")
  softDelete(@CurrentUser() u: any, @Param("id") id: string) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.softDelete({ branchId, id });
  }
}
