import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from 'src/cash/schemas/cash-movement.schema';

export class PosItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(0.000001)
  qty: number;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class PosPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0.000001)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CreatePosCartDto {
  @IsOptional()
  @IsMongoId()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosItemDto)
  items?: PosItemDto[];
}

export class UpdatePosCartItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosItemDto)
  items: PosItemDto[];
}

export class UpdatePosCartNoteDto {
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CheckoutPosCartDto {
  @IsString()
  dateKey: string; // YYYY-MM-DD

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosPaymentDto)
  payments: PosPaymentDto[];

  @IsOptional()
  @IsString()
  concept?: string;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;
}
