import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { Roles } from "src/auth/roles.decorator";
import { CurrentUser } from "src/auth/current-user.decorator";
import { FinanceStatsService } from "./finance-stats.service";
import { PeriodType } from "./finance-stats.utils";

@UseGuards(JwtAuthGuard)
@Controller("finance/stats")
export class FinanceStatsController {
  constructor(private readonly service: FinanceStatsService) {}

  @Get()
  @Roles("ADMIN", "CASHIER")
  get(
    @CurrentUser() u: any,
    @Query("periodType") periodType: PeriodType = "day",
    @Query("dateKey") dateKey?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("q") q?: string,
  ) {
    const branchId = String(u?.branchId || "");
    if (!branchId) throw new BadRequestException("branchId faltante en el usuario");

    return this.service.getStats({
      branchId,
      periodType,
      dateKey,
      from,
      to,
      q,
    });
  }
}
