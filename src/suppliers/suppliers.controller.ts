import { Body, Controller, Get, Patch, Post, Param, UseGuards } from "@nestjs/common";
import { SuppliersService } from "./suppliers.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

@Controller("suppliers")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() body: { name: string }) {
    return this.suppliers.create(body.name);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER')
  findAll() {
    return this.suppliers.findAll();
  }

  @Patch(":id/active")
  @Roles('ADMIN')
  setActive(@Param("id") id: string, @Body() body: { isActive: boolean }) {
    return this.suppliers.setActive(id, body.isActive);
  }
}
