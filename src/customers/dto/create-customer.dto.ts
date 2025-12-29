import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { CustomerTaxCondition } from "../schemas/customer.schema";
import { CustomerAddressDto } from "./customer-address.dto";

export class CreateCustomerDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string;

  @IsOptional()
  @IsEnum(CustomerTaxCondition)
  taxCondition?: CustomerTaxCondition;

  @IsOptional()
  @IsArray()
  @Type(() => CustomerAddressDto)
  addresses?: CustomerAddressDto[];

  @IsOptional()
  @IsString()
  @MaxLength(600)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
