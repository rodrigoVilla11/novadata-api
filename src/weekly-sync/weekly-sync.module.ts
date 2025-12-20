import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { WeeklySyncController } from "./weekly-sync.controller";
import { WeeklySyncService } from "./weekly-sync.service";
import { WeeklyThread, WeeklyThreadSchema } from "./schemas/weekly-thread.schema";
import { WeeklyMessage, WeeklyMessageSchema } from "./schemas/weekly-message.schema";
import { User, UserSchema } from "src/users/schemas/user.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WeeklyThread.name, schema: WeeklyThreadSchema },
      { name: WeeklyMessage.name, schema: WeeklyMessageSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [WeeklySyncController],
  providers: [WeeklySyncService],
  exports: [WeeklySyncService],
})
export class WeeklySyncModule {}
