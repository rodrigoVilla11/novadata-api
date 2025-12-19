import { Injectable, OnModuleInit } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  constructor(private users: UsersService) {}

  async onModuleInit() {
    const email = process.env.ADMIN_EMAIL || 'admin@local.com';
    const pass = process.env.ADMIN_PASSWORD || 'admin123';

    const existing = await this.users.getUnsafeByEmail(email);
    if (existing) return;

    await this.users.create(email, pass, ['ADMIN']);
    console.log(`✅ Seed ADMIN created: ${email}`);
  }
}
