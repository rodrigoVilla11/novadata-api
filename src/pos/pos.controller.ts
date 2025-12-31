import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/auth/roles.decorator';

import { PosService } from './pos.service';
import {
  CheckoutPosCartDto,
  CreatePosCartDto,
  UpdatePosCartItemsDto,
  UpdatePosCartNoteDto,
} from './dto/pos.dto';
import { PosCheckoutDto } from './dto/pos-checkout.dto';

@Controller('pos')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN', 'MANAGER', 'CASHIER')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('cart')
  createCart(@Body() dto: CreatePosCartDto) {
    return this.posService.createCart(dto as any);
  }

  @Get('cart')
  listCarts(@Query('status') status?: any, @Query('limit') limit?: string) {
    return this.posService.listCarts({
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('cart/:id')
  getCart(@Param('id') id: string) {
    return this.posService.getCart(id);
  }

  @Put('cart/:id/items')
  setCartItems(@Param('id') id: string, @Body() dto: UpdatePosCartItemsDto) {
    return this.posService.setCartItems(id, dto.items as any);
  }

  @Put('cart/:id/note')
  setCartNote(@Param('id') id: string, @Body() dto: UpdatePosCartNoteDto) {
    return this.posService.setCartNote(id, dto.note ?? null);
  }

  @Post('cart/:id/cancel')
  cancelCart(@Param('id') id: string) {
    return this.posService.cancelCart(id);
  }

  @Get('cart/:id/sale')
  getSaleForCart(@Param('id') id: string) {
    return this.posService.getSaleForCart(id);
  }

  @Post('cart/:id/checkout')
  checkoutCart(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CheckoutPosCartDto,
  ) {
    return this.posService.checkoutCart(req.user, id, dto as any);
  }
  @Post('checkout')
  checkout(@Req() req: any, @Body() dto: PosCheckoutDto) {
    return this.posService.checkout(req.user, dto);
  }
}
