import { IsOptional, IsString } from "class-validator";

export class LinkEmployeeUserDto {
  @IsOptional()
  @IsString()
  userId?: string | null; // null para desvincular
}
