import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "src/auth/roles.decorator";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { ListCustomersDto } from "./dto/list-customers.dto";

@Controller("customers")
@UseGuards(AuthGuard("jwt"))
@Roles("ADMIN", "MANAGER")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateCustomerDto) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    return this.customersService.create(userId, dto);
  }

  @Get()
  async list(@Query() q: ListCustomersDto) {
    const onlyActive = String(q.onlyActive ?? "").toLowerCase() === "true";
    const limit = q.limit ?? 50;

    const res = await this.customersService.list({
      q: q.q,
      onlyActive,
      limit,
      cursor: q.cursor,
    });

    return res;
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(":id")
  async update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    return this.customersService.update(userId, id, dto);
  }

  @Patch(":id/active")
  async setActive(@Req() req: any, @Param("id") id: string, @Body() body: { isActive: boolean }) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    return this.customersService.setActive(userId, id, !!body?.isActive);
  }
}
