// src/pos/dto/pos-checkout.dto.ts
import { PaymentMethod } from 'src/cash/schemas/cash-movement.schema';

export class PosCheckoutDto {
  dateKey: string; // YYYY-MM-DD
  customerId?: string | null;
  note?: string | null;

  items: Array<{
    productId: string;
    qty: number;
    note?: string | null;
  }>;

  payments: Array<{
    method: PaymentMethod;
    amount: number;
    note?: string | null;
  }>;

  concept?: string;       // "VENTA POS"
  categoryId?: string | null; // opcional finance
}
