import { IsBoolean } from "class-validator";

export class SetTaskActiveDto {
  @IsBoolean()
  isActive: boolean;
}
