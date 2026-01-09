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
import { FinanceMovementsService } from "./finance-movements.service";
import { CreateFinanceMovementDto } from "./dto/create-finance-movement.dto";
import { UpdateFinanceMovementDto } from "./dto/update-finance-movement.dto";
import { FinanceMovementType } from "./schemas/finance-movement.schema";

@UseGuards(JwtAuthGuard)
@Controller("finance/movements")
export class FinanceMovementsController {
  constructor(private readonly service: FinanceMovementsService) {}

  private getBranchIdOrThrow(u: any) {
    const branchId = String(u?.branchId || "");
    if (!branchId) throw new BadRequestException("branchId faltante en el usuario");
    return branchId;
  }

  private getUserIdOrThrow(u: any) {
    const userId = String(u?.id || u?.userId || u?._id || "");
    if (!userId) throw new BadRequestException("userId faltante en el usuario");
    return userId;
  }

  @Get()
  @Roles("ADMIN", "CASHIER")
  list(
    @CurrentUser() u: any,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("type") type?: FinanceMovementType,
    @Query("accountId") accountId?: string,
    @Query("categoryId") categoryId?: string,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
    @Query("includeVoids") includeVoids?: string,
    @Query("status") status?: string,
  ) {
    const branchId = this.getBranchIdOrThrow(u);

    return this.service.findAll({
      branchId,
      from,
      to,
      type,
      accountId,
      categoryId,
      q,
      includeVoids: includeVoids === "true",
      status: status as "ALL" | "POSTED" | "VOID" | undefined,
      limit: limit ? Number(limit) : 50,
      page: page ? Number(page) : 1,
    });
  }

  @Get(":id")
  @Roles("ADMIN", "CASHIER")
  getOne(@CurrentUser() u: any, @Param("id") id: string) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.findOne({ branchId, id });
  }

  @Post()
  @Roles("ADMIN", "CASHIER")
  create(@CurrentUser() u: any, @Body() dto: CreateFinanceMovementDto) {
    const branchId = this.getBranchIdOrThrow(u);
    const userId = this.getUserIdOrThrow(u);
    const roles = (u?.roles || []) as string[];

    return this.service.create({ branchId, userId, roles, dto });
  }

  @Patch(":id")
  @Roles("ADMIN", "CASHIER")
  update(
    @Param("id") id: string,
    @CurrentUser() u: any,
    @Body() dto: UpdateFinanceMovementDto,
  ) {
    const branchId = this.getBranchIdOrThrow(u);
    const roles = (u?.roles || []) as string[];

    return this.service.update({ branchId, id, roles, dto });
  }

  @Post(":id/void")
  @Roles("ADMIN", "CASHIER")
  void(@Param("id") id: string, @CurrentUser() u: any) {
    const branchId = this.getBranchIdOrThrow(u);
    const roles = (u?.roles || []) as string[];

    return this.service.void({ branchId, id, roles });
  }
}
