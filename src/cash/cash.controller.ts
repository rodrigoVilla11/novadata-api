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
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "src/auth/roles.decorator";

import { CashService } from "./cash.service";
import { OpenCashDayDto } from "./dto/open-cash-day.dto";
import { CloseCashDayDto } from "./dto/close-cash-day.dto";
import { CreateMovementDto } from "./dto/create-movement.dto";

function pickBranchId(req: any) {
  // si tu JWT guarda branchId en payload (como venimos haciendo)
  const b = req?.user?.branchId ?? null;
  return b ? String(b) : null;
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
   * ✅ Recomendación multi-branch: si el user tiene branchId y NO es ADMIN,
   * ignoramos branchId del query y usamos la branch del user.
   */
  @Get("day")
  async getDay(
    @Req() req: any,
    @Query("dateKey") dateKey: string,
    @Query("branchId") branchId?: string
  ) {
    const userBranchId = pickBranchId(req);

    // si querés forzar SIEMPRE branch por JWT (más seguro):
    // const effectiveBranchId = userBranchId;
    //
    // si querés permitir que ADMIN consulte otra branch:
    const roles = (req?.user?.roles ?? []).map((r: any) =>
      String(r).toUpperCase()
    );
    const isAdmin = roles.includes("ADMIN");

    const effectiveBranchId = isAdmin
      ? branchId ?? userBranchId ?? undefined
      : userBranchId ?? undefined;

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
    const userBranchId = pickBranchId(req);

    const roles = (req?.user?.roles ?? []).map((r: any) =>
      String(r).toUpperCase()
    );
    const isAdmin = roles.includes("ADMIN");

    const effectiveBranchId = isAdmin
      ? body.branchId ?? userBranchId ?? undefined
      : userBranchId ?? undefined;

    if (!isAdmin && body.branchId && userBranchId && body.branchId !== userBranchId) {
      throw new ForbiddenException("No podés operar otra sucursal.");
    }

    return this.cashService.getOrCreateDay(req.user, body.dateKey, effectiveBranchId);
  }

  // POST /cash/day/open
  @Post("day/open")
  async openDay(@Req() req: any, @Body() dto: OpenCashDayDto) {
    const userBranchId = pickBranchId(req);
    const roles = (req?.user?.roles ?? []).map((r: any) =>
      String(r).toUpperCase()
    );
    const isAdmin = roles.includes("ADMIN");

    const effectiveBranchId = isAdmin
      ? dto.branchId ?? userBranchId ?? undefined
      : userBranchId ?? undefined;

    if (!isAdmin && dto.branchId && userBranchId && dto.branchId !== userBranchId) {
      throw new ForbiddenException("No podés operar otra sucursal.");
    }

    return this.cashService.openDay(req.user, { ...dto, branchId: effectiveBranchId } as any);
  }

  // POST /cash/day/close
  @Post("day/close")
  async closeDay(@Req() req: any, @Body() dto: CloseCashDayDto) {
    const userBranchId = pickBranchId(req);
    const roles = (req?.user?.roles ?? []).map((r: any) =>
      String(r).toUpperCase()
    );
    const isAdmin = roles.includes("ADMIN");

    const effectiveBranchId = isAdmin
      ? dto.branchId ?? userBranchId ?? undefined
      : userBranchId ?? undefined;

    if (!isAdmin && dto.branchId && userBranchId && dto.branchId !== userBranchId) {
      throw new ForbiddenException("No podés operar otra sucursal.");
    }

    return this.cashService.closeDay(req.user, { ...dto, branchId: effectiveBranchId } as any);
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
    const userBranchId = pickBranchId(req);
    const effectiveBranchId = branchId ?? userBranchId ?? undefined;

    return this.cashService.reopenDay(req.user, dateKey, effectiveBranchId, note);
  }

  // GET /cash/summary?dateKey=...&branchId=...
  @Get("summary")
  async summary(
    @Req() req: any,
    @Query("dateKey") dateKey: string,
    @Query("branchId") branchId?: string
  ) {
    const userBranchId = pickBranchId(req);

    const roles = (req?.user?.roles ?? []).map((r: any) =>
      String(r).toUpperCase()
    );
    const isAdmin = roles.includes("ADMIN");

    const effectiveBranchId = isAdmin
      ? branchId ?? userBranchId ?? undefined
      : userBranchId ?? undefined;

    return this.cashService.getDaySummary(req.user, dateKey, effectiveBranchId);
  }

  // --------------------------------
  // Movements
  // --------------------------------

  // GET /cash/movements/:cashDayId
  @Get("movements/:cashDayId")
  async listMovements(@Param("cashDayId") cashDayId: string) {
    return this.cashService.listMovements(cashDayId);
  }

  // POST /cash/movement
  @Post("movement")
  async createMovement(@Req() req: any, @Body() dto: CreateMovementDto) {
    // Nota: acá no pasamos branchId porque el CashDayId ya “ata” sucursal.
    // La seguridad real la tenés que hacer en el service:
    // - buscar cashDay por id
    // - comparar cashDay.branchId con req.user.branchId (si no es ADMIN)
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
