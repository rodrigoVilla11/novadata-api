import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { Roles } from "src/auth/roles.decorator";
import { CurrentUser } from "src/auth/current-user.decorator";
import { FinanceClosingsService } from "./finance-closings.service";
import { UpsertDayClosingDto } from "./dto/upsert-day-closing.dto";

@UseGuards(JwtAuthGuard)
@Controller("finance/closings")
export class FinanceClosingsController {
  constructor(private readonly service: FinanceClosingsService) {}

  @Get(":dateKey")
  @Roles("ADMIN", "CASHIER")
  getOne(@Param("dateKey") dateKey: string) {
    return this.service.getOne(dateKey);
  }

  // Guardar declared (draft). No calcula.
  @Post(":dateKey")
  @Roles("ADMIN", "CASHIER")
  upsert(@Param("dateKey") dateKey: string, @CurrentUser() u: any, @Body() dto: UpsertDayClosingDto) {
    const userId = String(u?.id || u?.userId || "");
    return this.service.upsertDeclared(dateKey, userId, dto);
  }

  // Submit: recalcula computed + diff y marca SUBMITTED
  @Post(":dateKey/submit")
  @Roles("ADMIN", "CASHIER")
  submit(@Param("dateKey") dateKey: string, @CurrentUser() u: any) {
    const userId = String(u?.id || u?.userId || "");
    return this.service.submit(dateKey, userId);
  }

  // Lock: solo ADMIN
  @Post(":dateKey/lock")
  @Roles("ADMIN")
  lock(@Param("dateKey") dateKey: string, @CurrentUser() u: any) {
    const userId = String(u?.id || u?.userId || "");
    return this.service.lock(dateKey, userId);
  }
}
