import { Body, Controller, Get, Put, Query, UseGuards, Req } from "@nestjs/common";
import { StockSnapshotsService } from "./stock-snapshots.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

@Controller("stock-snapshots")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class StockSnapshotsController {
  constructor(private readonly snapshots: StockSnapshotsService) {}

  @Get()
  getOne(@Query("dateKey") dateKey: string, @Query("supplierId") supplierId: string) {
    return this.snapshots.getOne({ dateKey, supplierId });
  }

  @Put()
  upsert(
    @Body()
    body: {
      dateKey: string;
      supplierId: string;
      items: { productId: string; qty: number }[];
    },
    @Req() req: any,
  ) {
    // si querés registrar quién lo cargó:
    const userId = req.user?.userId;
    return this.snapshots.upsert({ ...body, createdBy: userId });
  }
}
