import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';
import { CategoriesService } from './categories.service';

@Controller('categories')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  findAll(
    @Query('onlyActive') onlyActive?: string,
    @Query('branchId') branchId?: string,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
  ) {
    return this.service.findAll({
      onlyActive: onlyActive === 'true',
      branchId,
      tag,
      q,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.service.setActive(id, !!body?.isActive);
  }
}
