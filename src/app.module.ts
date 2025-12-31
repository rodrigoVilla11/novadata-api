import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { StockSnapshotsModule } from './stock-snapshots/stock-snapshots.module';
import { EmployeesModule } from './employees/employees.module';
import { AttendanceModule } from './attendance/attendance.module';
import { TasksModule } from './tasks/tasks.module';
import { ProductionModule } from './production/production.module';
import { MeModule } from './me/me.module';
import { WeeklySyncModule } from './weekly-sync/weekly-sync.module';
import { FinanceCategoriesModule } from './finance/categories/finance-categories.module';
import { FinanceAccountsModule } from './finance/accounts/finance-accounts.module';
import { FinanceMovementsModule } from './finance/movements/finance-movements.module';
import { FinanceClosingsModule } from './finance/closings/finance-closings.module';
import { FinanceStatsModule } from './finance/stats/finance-stats.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { PreparationsModule } from './preparations/preparations.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { CashModule } from './cash/cash.module';
import { StockModule } from './stock/stock.module';
import { RecipeModule } from './recipes/recipe.module';
import { OrdersModule } from './orders/orders.module';
import { SalesModule } from './sales/sales.module';
import { PosModule } from './pos/pos.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // no hace falta importarlo en otros módulos
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),

    UsersModule,
    AuthModule,
    SuppliersModule,
    IngredientsModule,
    StockSnapshotsModule,
    EmployeesModule,
    AttendanceModule,
    TasksModule,
    ProductionModule,
    MeModule,
    WeeklySyncModule,
    FinanceCategoriesModule,
    FinanceAccountsModule,
    FinanceMovementsModule,
    FinanceClosingsModule,
    FinanceStatsModule,
    PreparationsModule,
    ProductsModule,
    CategoriesModule,
    CustomersModule,
    CashModule,
    StockModule,
    RecipeModule,
    OrdersModule,
    SalesModule,
    PosModule
  ],
})
export class AppModule {}
