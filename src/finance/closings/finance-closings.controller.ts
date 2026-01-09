import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { Roles } from "src/auth/roles.decorator";
import { CurrentUser } from "src/auth/current-user.decorator";
import { FinanceClosingsService } from "./finance-closings.service";
import { UpsertDayClosingDto } from "./dto/upsert-day-closing.dto";

@UseGuards(JwtAuthGuard)
@Controller("finance/closings")
export class FinanceClosingsController {
  constructor(private readonly service: FinanceClosingsService) {}

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

  @Get(":dateKey")
  @Roles("ADMIN", "CASHIER")
  getOne(@Param("dateKey") dateKey: string, @CurrentUser() u: any) {
    const branchId = this.getBranchIdOrThrow(u);
    return this.service.getOne({ branchId, dateKey });
  }

  // Guardar declared (draft). No calcula.
  @Post(":dateKey")
  @Roles("ADMIN", "CASHIER")
  upsert(
    @Param("dateKey") dateKey: string,
    @CurrentUser() u: any,
    @Body() dto: UpsertDayClosingDto,
  ) {
    const branchId = this.getBranchIdOrThrow(u);
    const userId = this.getUserIdOrThrow(u);

    return this.service.upsertDeclared({ branchId, dateKey, userId, dto });
  }

  // Submit: recalcula computed + diff y marca SUBMITTED
  @Post(":dateKey/submit")
  @Roles("ADMIN", "CASHIER")
  submit(@Param("dateKey") dateKey: string, @CurrentUser() u: any) {
    const branchId = this.getBranchIdOrThrow(u);
    const userId = this.getUserIdOrThrow(u);

    return this.service.submit({ branchId, dateKey, userId });
  }

  // Lock: solo ADMIN
  @Post(":dateKey/lock")
  @Roles("ADMIN")
  lock(@Param("dateKey") dateKey: string, @CurrentUser() u: any) {
    const branchId = this.getBranchIdOrThrow(u);
    const adminUserId = this.getUserIdOrThrow(u);

    return this.service.lock({ branchId, dateKey, adminUserId });
  }
}
