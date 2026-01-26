// src/cash/cash.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "src/auth/roles.decorator";

import { CashService } from "./cash.service";
import { OpenCashDayDto } from "./dto/open-cash-day.dto";
import { CloseCashDayDto } from "./dto/close-cash-day.dto";
import { CreateMovementDto } from "./dto/create-movement.dto";

/**
 * Multi-tenant helpers (branchId)
 * - branchId SIEMPRE viene del JWT para no-ADMIN
 * - ADMIN puede pasar branchId en query/body; si no pasa, usa la del JWT
 */
function getUserBranchIdOrThrow(req: any) {
  const branchId = req?.user?.branchId;
  if (!branchId) throw new UnauthorizedException("Missing branchId in token");
  return String(branchId);
}

function isAdmin(req: any) {
  const roles = (req?.user?.roles ?? []).map((r: any) => String(r).toUpperCase());
  return roles.includes("ADMIN");
}

function resolveBranchIdOrThrow(req: any, requested?: string) {
  const userBranchId = getUserBranchIdOrThrow(req);

  if (isAdmin(req)) {
    return String(requested ?? userBranchId);
  }

  if (requested && requested !== userBranchId) {
    throw new ForbiddenException("No podés operar otra sucursal.");
  }

  return userBranchId;
}

@Controller("cash")
@UseGuards(AuthGuard("jwt"))
@Roles("ADMIN", "MANAGER", "CASHIER")
export class CashController {
  constructor(private readonly cashService: CashService) {}

  // --------------------------------
  // Day
  // --------------------------------

  /**
   * GET /cash/day?dateKey=YYYY-MM-DD&branchId=...
   * - ADMIN puede consultar otra branch
   * - NO ADMIN siempre usa branch del JWT
   */
  @Get("day")
  async getDay(
    @Req() req: any,
    @Query("dateKey") dateKey: string,
    @Query("branchId") branchId?: string
  ) {
    const effectiveBranchId = resolveBranchIdOrThrow(req, branchId);
    return this.cashService.getDayByDateKey(dateKey, effectiveBranchId);
  }

  /**
   * POST /cash/day/get-or-create
   * body: { dateKey, branchId? }
   */
  @Post("day/get-or-create")
  async getOrCreate(
    @Req() req: any,
    @Body() body: { dateKey: string; branchId?: string }
  ) {
    const effectiveBranchId = resolveBranchIdOrThrow(req, body?.branchId);
    return this.cashService.getOrCreateDay(req.user, body.dateKey, effectiveBranchId);
  }

  // POST /cash/day/open
  @Post("day/open")
  async openDay(@Req() req: any, @Body() dto: OpenCashDayDto) {
    const effectiveBranchId = resolveBranchIdOrThrow(req, (dto as any)?.branchId);
    return this.cashService.openDay(req.user, {
      ...(dto as any),
      branchId: effectiveBranchId,
    });
  }

  // POST /cash/day/close
  @Post("day/close")
  async closeDay(@Req() req: any, @Body() dto: CloseCashDayDto) {
    const effectiveBranchId = resolveBranchIdOrThrow(req, (dto as any)?.branchId);
    return this.cashService.closeDay(req.user, {
      ...(dto as any),
      branchId: effectiveBranchId,
    });
  }

  // POST /cash/day/reopen?dateKey=...&branchId=...&note=...
  @Post("day/reopen")
  @Roles("ADMIN")
  async reopenDay(
    @Req() req: any,
    @Query("dateKey") dateKey: string,
    @Query("branchId") branchId?: string,
    @Query("note") note?: string
  ) {
    // ADMIN: si no manda branchId, usamos la suya del JWT
    const effectiveBranchId = resolveBranchIdOrThrow(req, branchId);
    return this.cashService.reopenDay(req.user, dateKey, effectiveBranchId, note);
  }

  // GET /cash/summary?dateKey=...&branchId=...
  @Get("summary")
  async summary(
    @Req() req: any,
    @Query("dateKey") dateKey: string,
    @Query("branchId") branchId?: string
  ) {
    const effectiveBranchId = resolveBranchIdOrThrow(req, branchId);
    return this.cashService.getDaySummary(req.user, dateKey, effectiveBranchId);
  }

  // --------------------------------
  // Movements
  // --------------------------------

  // GET /cash/movements/:cashDayId
  @Get("movements/:cashDayId")
  async listMovements(@Req() req: any, @Param("cashDayId") cashDayId: string) {
    return this.cashService.listMovements(req.user, cashDayId);
  }

  // POST /cash/movement
  @Post("movement")
  async createMovement(@Req() req: any, @Body() dto: CreateMovementDto) {
    return this.cashService.createMovement(req.user, dto);
  }

  // POST /cash/movement/:id/void
  @Post("movement/:id/void")
  async voidMovement(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { reason?: string }
  ) {
    return this.cashService.voidMovement(req.user, id, body?.reason);
  }
}
