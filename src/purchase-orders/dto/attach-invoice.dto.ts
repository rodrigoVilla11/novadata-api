// src/purchase-orders/dto/attach-invoice.dto.ts
import { IsOptional, IsString } from "class-validator";

export class AttachInvoiceDto {
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() imagePublicId?: string;

  @IsOptional() @IsString() pdfUrl?: string;
  @IsOptional() @IsString() pdfPublicId?: string;

  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsString() invoiceDate?: string; // ISO
}
