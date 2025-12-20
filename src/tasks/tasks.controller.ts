import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { SetTaskActiveDto } from "./dto/set-task-active.dto";
import { Roles } from "../auth/roles.decorator";

@Controller("tasks")
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // ADMIN: crear
  @Post()
  @Roles("ADMIN")
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  // ADMIN y MANAGER: listar
  // GET /tasks?activeOnly=true&area=Cocina
  @Get()
  @Roles("ADMIN", "MANAGER")
  findAll(
    @Query("activeOnly") activeOnly?: string,
    @Query("area") area?: string
  ) {
    return this.tasksService.findAll({
      activeOnly: activeOnly === "true",
      area: area?.trim() ? area.trim() : undefined,
    });
  }

  @Get(":id")
  @Roles("ADMIN", "MANAGER")
  findOne(@Param("id") id: string) {
    return this.tasksService.findOne(id);
  }

  // ADMIN: editar
  @Patch(":id")
  @Roles("ADMIN")
  update(@Param("id") id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  // ADMIN: activar/desactivar
  @Patch(":id/active")
  @Roles("ADMIN")
  setActive(@Param("id") id: string, @Body() dto: SetTaskActiveDto) {
    return this.tasksService.setActive(id, dto.isActive);
  }
}
