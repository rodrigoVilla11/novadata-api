import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { Roles } from "src/auth/roles.decorator";
import { FinanceStatsService } from "./finance-stats.service";
import { PeriodType } from "./finance-stats.utils";

@UseGuards(JwtAuthGuard)
@Controller("finance/stats")
export class FinanceStatsController {
  constructor(private readonly service: FinanceStatsService) {}

  @Get()
  @Roles("ADMIN", "CASHIER")
  get(
    @Query("periodType") periodType: PeriodType = "day",
    @Query("dateKey") dateKey?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.getStats({ periodType, dateKey, from, to });
  }
}
