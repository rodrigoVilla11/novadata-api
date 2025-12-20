import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ProductionService } from './production.service';
import { CreateProductionDto } from './dto/create-production.dto';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('production')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  // Crear entrada (MANAGER/ADMIN)
  @UseGuards(JwtAuthGuard)
  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() dto: CreateProductionDto, @Req() req: any) {
    const userId =
      req?.user?.sub || req?.user?.id || req?.user?._id || req?.user?.userId;
    return this.productionService.create(dto, String(userId));
  }

  // Listar
  // GET /production?dateKey=2025-12-18&employeeId=...&taskId=...&limit=200
  @Get()
  @Roles('ADMIN', 'MANAGER')
  list(
    @Query('dateKey') dateKey?: string,
    @Query('employeeId') employeeId?: string,
    @Query('taskId') taskId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productionService.list({
      dateKey: dateKey?.trim() || undefined,
      employeeId: employeeId?.trim() || undefined,
      taskId: taskId?.trim() || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // Borrar (opcional)
  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  remove(@Param('id') id: string) {
    return this.productionService.remove(id);
  }
}
