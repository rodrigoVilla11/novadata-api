import { Module } from '@nestjs/common';
import { MeService } from './me.service';
import { MeController } from './me.controller';
import { AttendanceRecord, AttendanceSchema } from 'src/attendance/schemas/attendance.schema';
import { Employee, EmployeeSchema } from 'src/employees/schemas/employee.schema';
import { ProductionEntry, ProductionSchema } from 'src/production/schemas/production.schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
   imports: [
      MongooseModule.forFeature([
        { name: AttendanceRecord.name, schema: AttendanceSchema },
        { name: Employee.name, schema: EmployeeSchema },
        { name: ProductionEntry.name, schema: ProductionSchema },
      ]),
    ],
  providers: [MeService],
  controllers: [MeController]
})
export class MeModule {}
