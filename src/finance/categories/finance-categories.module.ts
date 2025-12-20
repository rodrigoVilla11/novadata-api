import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { FinanceCategoriesService } from "./finance-categories.service";
import { FinanceCategoriesController } from "./finance-categories.controller";
import { FinanceCategory, FinanceCategorySchema } from "./schemas/finance-category.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FinanceCategory.name, schema: FinanceCategorySchema },
    ]),
  ],
  controllers: [FinanceCategoriesController],
  providers: [FinanceCategoriesService],
  exports: [FinanceCategoriesService],
})
export class FinanceCategoriesModule {}
