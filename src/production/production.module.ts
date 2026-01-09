import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { ProductionEntry, ProductionSchema } from './schemas/production.schema';
import { Employee, EmployeeSchema } from 'src/employees/schemas/employee.schema';
import { Task, TaskSchema } from 'src/tasks/schemas/task.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductionEntry.name, schema: ProductionSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
