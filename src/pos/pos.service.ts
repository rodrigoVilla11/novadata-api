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

function getBranchIdOrThrow(user: any) {
  const branchId = user?.branchId ?? null;
  if (!branchId || String(branchId).trim() === '') {
    throw new BadRequestException('branchId is required (missing in req.user)');
  }
  return String(branchId);
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

  async createCart(
    user: any,
    dto: {
      customerId?: string | null;
      note?: string | null;
      items?: Array<{ productId: string; qty: number; note?: string | null }>;
    },
  ) {
    const branchId = getBranchIdOrThrow(user);

    return this.ordersService.create({
      branchId,
      source: 'POS',
      customerId: dto.customerId ?? null,
      note: dto.note ?? null,
      items: dto.items?.length ? dto.items : undefined,
    });
  }

  async getCart(user: any, orderId: string) {
    const branchId = getBranchIdOrThrow(user);
    return this.ordersService.findOne(branchId, orderId);
  }

  async listCarts(user: any, params?: { status?: OrderStatus; limit?: number }) {
    const branchId = getBranchIdOrThrow(user);

    return this.ordersService.findAll({
      branchId,
      source: 'POS',
      status: params?.status ?? OrderStatus.DRAFT,
      limit: params?.limit ?? 50,
    });
  }

  async setCartItems(
    user: any,
    orderId: string,
    items: Array<{ productId: string; qty: number; note?: string | null }>,
  ) {
    const branchId = getBranchIdOrThrow(user);
    return this.ordersService.setItems(branchId, orderId, items);
  }

  async setCartNote(user: any, orderId: string, note: string | null) {
    const branchId = getBranchIdOrThrow(user);
    return this.ordersService.setNote(branchId, orderId, note);
  }

  async cancelCart(user: any, orderId: string) {
    const branchId = getBranchIdOrThrow(user);
    return this.ordersService.cancel(branchId, orderId);
  }

  // ============================
  // Checkout = Order -> Sale -> Pay
  // ============================

  /**
   * Checkout de un carrito existente (Order POS)
   */
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
    const branchId = getBranchIdOrThrow(user);
    assertDateKey(dto?.dateKey);

    if (!orderId?.trim()) throw new BadRequestException('orderId is required');
    if (!Array.isArray(dto?.payments) || dto.payments.length === 0) {
      throw new BadRequestException('payments[] is required');
    }

    const order = await this.ordersService.findOne(branchId, orderId);

    if (order.source !== 'POS') {
      throw new BadRequestException('Order source must be POS');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cart is CANCELLED');
    }
    if (!order.items?.length) {
      throw new BadRequestException('Cart has no items');
    }

    // 1) Cerrar carrito (idempotente)
    if (order.status === OrderStatus.DRAFT) {
      await this.ordersService.accept(branchId, orderId);
    } else if (order.status !== OrderStatus.ACCEPTED) {
      throw new BadRequestException(
        `Cart must be DRAFT or ACCEPTED (is ${order.status})`,
      );
    }

    // 2) Obtener o crear Sale desde Order (idempotente por orderId)
    let sale = await this.salesService.findByOrderId(branchId, orderId);
    if (!sale) {
      sale = await this.salesService.createFromOrder(user, branchId, orderId);
    }

    // 3) Si ya está pagada, devolvemos tal cual (idempotente)
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

    if (sale.status === SaleStatus.VOIDED || (sale as any).voided) {
      throw new BadRequestException('Sale is VOIDED');
    }

    // 4) Pagar (caja + stock OUT + marcar PAID)
    const paid = await this.salesService.pay(user, branchId, sale.id, {
      dateKey: dto.dateKey,
      payments: dto.payments.map((p) => ({
        method: p.method,
        amount: num(p.amount),
        note: p.note ?? null,
      })) as any,
      concept: dto.concept ?? 'VENTA POS',
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

  /**
   * Lookup rápido de venta por order (útil para frontend POS)
   */
  async getSaleForCart(user: any, orderId: string) {
    const branchId = getBranchIdOrThrow(user);
    const sale = await this.salesService.findByOrderId(branchId, orderId);
    if (!sale) throw new NotFoundException('Sale not found for this order');
    return sale;
  }

  /**
   * Checkout “directo” (sin carrito previo):
   * - crea order POS
   * - acepta
   * - crea sale
   * - paga
   */
  async checkout(user: any, dto: PosCheckoutDto) {
    const branchId = getBranchIdOrThrow(user);
    assertDateKey(dto.dateKey);

    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('items[] is required');
    }
    if (!Array.isArray(dto.payments) || dto.payments.length === 0) {
      throw new BadRequestException('payments[] is required');
    }

    // 1) crear order POS
    const order = await this.ordersService.create({
      branchId,
      source: 'POS',
      customerId: dto.customerId ?? null,
      note: dto.note ?? null,
      items: dto.items,
    });

    // 2) aceptar order
    await this.ordersService.accept(branchId, order.id);

    // 3) crear sale desde order
    const sale = await this.salesService.createFromOrder(user, branchId, order.id);

    // 4) cobrar sale (caja + stock + mark paid)
    const paid = await this.salesService.pay(user, branchId, sale.id, {
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

    return { order, sale: paid };
  }
}
