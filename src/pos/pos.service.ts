import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { OrdersService } from 'src/orders/orders.service';
import { SalesService } from 'src/sales/sales.service';
import { OrderStatus } from 'src/orders/schemas/order.schema';
import { SaleStatus } from 'src/sales/schemas/sale.schema';
import { PosCheckoutDto } from './dto/pos-checkout.dto';

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function assertDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) {
    throw new BadRequestException('dateKey must be YYYY-MM-DD');
  }
}

@Injectable()
export class PosService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly salesService: SalesService,
  ) {}

  // ============================
  // Cart = Order(DRAFT)
  // ============================

  async createCart(dto: {
    customerId?: string | null;
    note?: string | null;
    items?: Array<{ productId: string; qty: number; note?: string | null }>;
  }) {
    return this.ordersService.create({
      source: 'POS',
      customerId: dto.customerId ?? null,
      note: dto.note ?? null,
      items: dto.items?.length ? dto.items : undefined,
    });
  }

  async getCart(orderId: string) {
    return this.ordersService.findOne(orderId);
  }

  async listCarts(params?: { status?: OrderStatus; limit?: number }) {
    return this.ordersService.findAll({
      source: 'POS',
      status: params?.status ?? OrderStatus.DRAFT,
      limit: params?.limit ?? 50,
    });
  }

  async setCartItems(
    orderId: string,
    items: Array<{ productId: string; qty: number; note?: string | null }>,
  ) {
    return this.ordersService.setItems(orderId, items);
  }

  async setCartNote(orderId: string, note: string | null) {
    return this.ordersService.setNote(orderId, note);
  }

  async cancelCart(orderId: string) {
    return this.ordersService.cancel(orderId);
  }

  // ============================
  // Checkout = Order -> Sale -> Pay
  // ============================

  async checkoutCart(
    user: any,
    orderId: string,
    dto: {
      dateKey: string;
      payments: Array<{ method: any; amount: number; note?: string | null }>;
      concept?: string;
      note?: string | null;
      categoryId?: string | null;
    },
  ) {
    if (!dto?.dateKey) throw new BadRequestException('dateKey is required');
    if (!Array.isArray(dto?.payments) || !dto.payments.length) {
      throw new BadRequestException('payments[] is required');
    }

    const order = await this.ordersService.findOne(orderId);

    if (order.source !== 'POS') {
      throw new BadRequestException('Order source must be POS');
    }
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(`Cart must be DRAFT (is ${order.status})`);
    }
    if (!order.items?.length)
      throw new BadRequestException('Cart has no items');

    // 1) Obtener o crear Sale desde Order (idempotente)
    let sale = await this.salesService.findByOrderId(orderId);

    if (!sale) {
      sale = await this.salesService.createFromOrder(user, orderId);
    }

    // si ya está pagada, devolvemos tal cual
    if (sale.status === SaleStatus.PAID) {
      return {
        orderId: order.id,
        sale,
        totals: {
          orderTotal: num(order.total),
          paidTotal: num(sale.paidTotal),
          status: sale.status,
        },
        idempotent: true,
      };
    }

    // si está voided, no permitimos pagar
    if (sale.status === SaleStatus.VOIDED || sale.voided) {
      throw new BadRequestException('Sale is VOIDED');
    }

    // 2) Pagar (esto crea movimientos en Cash + stock OUT)
    const paid = await this.salesService.pay(user, sale.id, {
      dateKey: dto.dateKey,
      payments: dto.payments as any,
      concept: dto.concept ?? 'VENTA',
      note: dto.note ?? null,
      categoryId: dto.categoryId ?? null,
    });

    return {
      orderId: order.id,
      sale: paid,
      totals: {
        orderTotal: num(order.total),
        paidTotal: num(paid.paidTotal),
        status: paid.status,
      },
      idempotent: false,
    };
  }

  // opcional: lookup rápido de venta por order (útil para frontend POS)
  async getSaleForCart(orderId: string) {
    const sale = await this.salesService.findByOrderId(orderId);
    if (!sale) throw new NotFoundException('Sale not found for this order');
    return sale;
  }
  async checkout(user: any, dto: PosCheckoutDto) {
    assertDateKey(dto.dateKey);

    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('items[] is required');
    }
    if (!Array.isArray(dto.payments) || dto.payments.length === 0) {
      throw new BadRequestException('payments[] is required');
    }

    // 1) crear order POS
    const order = await this.ordersService.create({
      source: 'POS',
      customerId: dto.customerId ?? null,
      note: dto.note ?? null,
      items: dto.items,
    });

    // 2) aceptar order
    await this.ordersService.accept(order.id);

    // 3) crear sale desde order
    const sale = await this.salesService.createFromOrder(user, order.id);

    // 4) cobrar sale (caja + stock + mark paid)
    const paid = await this.salesService.pay(user, sale.id, {
      dateKey: dto.dateKey,
      payments: dto.payments.map((p) => ({
        method: p.method,
        amount: num(p.amount),
        note: p.note ?? null,
      })),
      concept: dto.concept ?? 'VENTA POS',
      note: dto.note ?? null,
      categoryId: dto.categoryId ?? null,
    });

    return {
      order,
      sale: paid,
    };
  }
}
