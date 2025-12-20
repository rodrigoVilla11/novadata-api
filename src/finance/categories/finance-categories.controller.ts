import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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

  @Get()
  @Roles("ADMIN", "CASHIER")
  list(
    @Query("type") type?: FinanceCategoryType,
    @Query("active") active?: string,
    @Query("parentId") parentId?: string,
    @Query("q") q?: string,
  ) {
    const activeBool =
      active === undefined ? true : active === "true" ? true : active === "false" ? false : true;

    // parentId="null" => parentId=null (padres)
    const parsedParentId =
      parentId === undefined ? undefined : parentId === "null" ? null : parentId;

    return this.service.findAll({
      type,
      active: activeBool,
      parentId: parsedParentId,
      q,
      includeDeleted: false,
    });
  }

  @Get(":id")
  @Roles("ADMIN", "CASHIER")
  getOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles("ADMIN")
  create(@CurrentUser() u: any, @Body() dto: CreateFinanceCategoryDto) {
    const userId = String(u?.id || u?.userId || "");
    return this.service.create(userId, dto);
  }

  @Patch(":id")
  @Roles("ADMIN")
  update(@Param("id") id: string, @Body() dto: UpdateFinanceCategoryDto) {
    return this.service.update(id, dto);
  }

  @Post(":id/archive")
  @Roles("ADMIN")
  archive(@Param("id") id: string) {
    return this.service.archive(id);
  }

  @Post(":id/restore")
  @Roles("ADMIN")
  restore(@Param("id") id: string) {
    return this.service.restore(id);
  }

  // Si querés soft-delete real
  @Post(":id/delete")
  @Roles("ADMIN")
  softDelete(@Param("id") id: string) {
    return this.service.softDelete(id);
  }
}
