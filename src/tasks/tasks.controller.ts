import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { SetTaskActiveDto } from "./dto/set-task-active.dto";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "src/auth/roles.guard";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";

function getBranchIdOrThrow(req: any): string {
  const bid = req?.user?.branchId ?? req?.user?.branch_id ?? null;
  if (!bid) throw new UnauthorizedException("branchId faltante en el token");
  return String(bid);
}

@Controller("tasks")
@UseGuards(JwtAuthGuard,RolesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // ADMIN: crear
  @Post()
  @Roles("ADMIN")
  create(@Req() req: any, @Body() dto: CreateTaskDto) {
    const branchId = getBranchIdOrThrow(req);
    return this.tasksService.create(branchId, dto);
  }

  // ADMIN y MANAGER: listar
  // GET /tasks?activeOnly=true&area=Cocina
  @Get()
  @Roles("ADMIN", "MANAGER")
  findAll(
    @Req() req: any,
    @Query("activeOnly") activeOnly?: string,
    @Query("area") area?: string
  ) {
    const branchId = getBranchIdOrThrow(req);
    return this.tasksService.findAll(branchId, {
      activeOnly: activeOnly === "true",
      area: area?.trim() ? area.trim() : undefined,
    });
  }

  @Get(":id")
  @Roles("ADMIN", "MANAGER")
  findOne(@Req() req: any, @Param("id") id: string) {
    const branchId = getBranchIdOrThrow(req);
    return this.tasksService.findOne(branchId, id);
  }

  // ADMIN: editar
  @Patch(":id")
  @Roles("ADMIN")
  update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateTaskDto) {
    const branchId = getBranchIdOrThrow(req);
    return this.tasksService.update(branchId, id, dto);
  }

  // ADMIN: activar/desactivar
  @Patch(":id/active")
  @Roles("ADMIN")
  setActive(@Req() req: any, @Param("id") id: string, @Body() dto: SetTaskActiveDto) {
    const branchId = getBranchIdOrThrow(req);
    return this.tasksService.setActive(branchId, id, dto.isActive);
  }
}
