// src/sales/dto/void-sale.dto.ts
export class VoidSaleDto {
  dateKey: string; // YYYY-MM-DD (a qué caja imputar la reversa)
  reason?: string | null;
  note?: string | null; // nota opcional para movimientos
  concept?: string | null; // default: "REVERSA VENTA"
  categoryId?: string | null; // opcional finance
}
