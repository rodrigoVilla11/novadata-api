import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "src/auth/roles.decorator";
import { SettingsService } from "./settings.service";

@Controller("admin/settings")
@UseGuards(AuthGuard("jwt"))
@Roles("ADMIN")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("effective")
  getEffective(
    @Query("branchId") branchId?: string,
    @Query("subBranchId") subBranchId?: string,
  ) {
    return this.settingsService.getEffective({ branchId, subBranchId });
  }

  @Get("global")
  getGlobal() {
    return this.settingsService.getGlobal();
  }

  @Patch("scope")
  upsertScope(@Body() body: any) {
    // body: { scope: "GLOBAL"|"BRANCH"|"SUBBRANCH", branchId?, subBranchId?, data: {...} }
    return this.settingsService.upsertScope(body);
  }
}
