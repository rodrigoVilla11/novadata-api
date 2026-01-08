import { Injectable, OnModuleInit } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Role } from '../users/schemas/user.schema';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  constructor(private users: UsersService) {}

  async onModuleInit() {
    const email =  process.env.ADMIN_EMAIL || 'admin@local.com';
    const pass =  process.env.ADMIN_PASSWORD || 'admin123';

    const existing = await this.users.getUnsafeByEmail(email);
    if (existing) return;

    // Actor "system" con permisos de SUPERADMIN (solo para seed)
    const systemActor = {
      id: 'system',
      roles: ['SUPERADMIN'] as Role[],
      branchId: null,
    };

    await this.users.create(systemActor, {
      email,
      password: pass,
      roles: ['SUPERADMIN'],
      branchId: null,     // SUPERADMIN => null
      username: 'Superadmin',
    });

    // Evitá loguear password
    console.log(`✅ Seed SUPERADMIN created: ${email}`);
  }
}
