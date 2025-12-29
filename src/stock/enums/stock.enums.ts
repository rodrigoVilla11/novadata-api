export enum StockMovementType {
  IN = 'IN', // ingreso (compra/recepción/producción)
  OUT = 'OUT', // egreso (consumo por venta/merma)
  ADJUST = 'ADJUST', // ajuste por conteo
  REVERSAL = 'REVERSAL', // reversa de otro movimiento (anulación)
}

export enum StockMovementReason {
  SALE = 'SALE', // venta / POS / online
  PURCHASE = 'PURCHASE', // compra a proveedor
  WASTE = 'WASTE', // merma / desperdicio
  MANUAL = 'MANUAL', // ajuste manual
  INITIAL = 'INITIAL', // carga inicial
  RETURN = 'RETURN', // devolución
  TRANSFER = 'TRANSFER', // (futuro) traslado entre depósitos
}
