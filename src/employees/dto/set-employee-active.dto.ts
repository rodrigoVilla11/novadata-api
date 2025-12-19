import { IsBoolean } from "class-validator";

export class SetEmployeeActiveDto {
  @IsBoolean()
  isActive: boolean;
}
