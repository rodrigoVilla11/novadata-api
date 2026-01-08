import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "src/auth/roles.decorator";

import { BranchesService } from "./branches.service";
import { CreateBranchDto, UpdateBranchDto } from "./dto/branch.dto";

@Controller("branches")
@UseGuards(AuthGuard("jwt"))
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Roles("SUPERADMIN")
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }


  @Get()
  @Roles("SUPERADMIN")
  findAll(@Query("includeDeleted") includeDeleted?: string) {
    return this.branchesService.findAll({
      includeDeleted: includeDeleted === "true",
    });
  }


  @Get(":id")
  @Roles("SUPERADMIN")
  findOne(@Param("id") id: string) {
    return this.branchesService.findOne(id);
  }


  @Patch(":id")
  @Roles("SUPERADMIN")
  update(@Param("id") id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }


  @Delete(":id")
  @Roles("SUPERADMIN")
  remove(@Param("id") id: string) {
    return this.branchesService.remove(id);
  }

  @Patch(":id/restore")
  @Roles("SUPERADMIN")
  restore(@Param("id") id: string) {
    return this.branchesService.restore(id);
  }
}
