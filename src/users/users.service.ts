import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, Role } from './schemas/user.schema';

type Actor = {
  id: string;
  roles: Role[];
  branchId: string | null;
};

type CreateUserInput = {
  email: string;
  password: string;
  roles?: Role[];
  branchId?: string | null;
  username?: string | null;
};

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  // ---------------------------------------------
  // Helpers
  // ---------------------------------------------
  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  private toBranchObjectId(branchId?: string | null) {
    if (!branchId) return null;
    if (!Types.ObjectId.isValid(branchId)) {
      throw new BadRequestException('Invalid branchId');
    }
    return new Types.ObjectId(branchId);
  }

  private sanitize(doc: UserDocument) {
    const obj = doc.toObject();
    const { passwordHash, refreshTokenHash, ...safe } = obj as any;
    return {
      ...safe,
      id: String(obj._id),
      branchId: obj.branchId ? String(obj.branchId) : null,
    };
  }

  private isSuper(actor: Actor) {
    return actor.roles.includes('SUPERADMIN');
  }

  private isAdmin(actor: Actor) {
    return actor.roles.includes('ADMIN');
  }

  private normalizeRoles(roles?: Role[]) {
    const base = roles?.length ? roles : (['USER'] as Role[]);
    return base.map((r) => String(r).toUpperCase()) as Role[];
  }

  // ---------------------------------------------
  // Create (con reglas SUPERADMIN/ADMIN)
  // ---------------------------------------------
  async create(actor: Actor, input: CreateUserInput) {
    const normalized = this.normalizeEmail(input.email);

    const exists = await this.userModel.exists({ email: normalized });
    if (exists) throw new ConflictException('Email already in use');

    const rolesUpper = this.normalizeRoles(input.roles);
    const wantsSuper = rolesUpper.includes('SUPERADMIN');
    const wantsAdmin = rolesUpper.includes('ADMIN');

    // --- reglas de creación ---
    if (wantsSuper && !this.isSuper(actor)) {
      throw new ForbiddenException('Only SUPERADMIN can create SUPERADMIN');
    }
    if (wantsAdmin && !this.isSuper(actor)) {
      throw new ForbiddenException('Only SUPERADMIN can create ADMIN');
    }

    // --- branch assignment ---
    let branchId: string | null = input.branchId ?? null;

    if (this.isAdmin(actor)) {
      // ADMIN crea solo para SU branch
      if (!actor.branchId) throw new BadRequestException('ADMIN must have branchId');
      branchId = actor.branchId;

      // ADMIN no puede crear ADMIN/SUPERADMIN
      if (wantsAdmin || wantsSuper) {
        throw new ForbiddenException('ADMIN cannot create ADMIN/SUPERADMIN');
      }
    }

    // SUPERADMIN creando SUPERADMIN => branch null
    if (wantsSuper) branchId = null;

    // No super => branch obligatorio
    if (!wantsSuper && !branchId) {
      throw new BadRequestException('branchId is required for non-SUPERADMIN users');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const created = await this.userModel.create({
      email: normalized,
      passwordHash,
      roles: rolesUpper,
      branchId: this.toBranchObjectId(branchId),
      username: (input.username ?? '').trim() || null,
      isActive: true,
    });

    return this.sanitize(created);
  }

  // compat: tu método viejo
  async adminCreateUser(
    actor: Actor,
    email: string,
    password: string,
    roles: Role[] = ['USER'],
    branchId: string | null = null,
    username: string | null = null,
  ) {
    return this.create(actor, { email, password, roles, branchId, username });
  }

  // ---------------------------------------------
  // Updates
  // ---------------------------------------------
  async updateRoles(actor: Actor, userId: string, roles: Role[]) {
    const rolesUpper = this.normalizeRoles(roles);
    const wantsSuper = rolesUpper.includes('SUPERADMIN');
    const wantsAdmin = rolesUpper.includes('ADMIN');

    // Solo SUPERADMIN asigna SUPERADMIN/ADMIN
    if ((wantsSuper || wantsAdmin) && !this.isSuper(actor)) {
      throw new ForbiddenException('Only SUPERADMIN can assign ADMIN/SUPERADMIN');
    }

    // ADMIN solo edita usuarios de su branch
    if (this.isAdmin(actor)) {
      if (!actor.branchId) throw new BadRequestException('ADMIN must have branchId');
      const target = await this.userModel.findById(userId).select({ branchId: 1 }).exec();
      if (!target) throw new NotFoundException('User not found');
      if (!target.branchId || String(target.branchId) !== actor.branchId) {
        throw new ForbiddenException('Cannot edit users from another branch');
      }
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: { roles: rolesUpper } }, { new: true })
      .exec();

    if (!updated) throw new NotFoundException('User not found');
    return this.sanitize(updated);
  }

  async setBranch(actor: Actor, userId: string, branchId: string | null) {
    // Solo SUPERADMIN puede mover branch
    if (!this.isSuper(actor)) {
      throw new ForbiddenException('Only SUPERADMIN can change branch');
    }

    if (!branchId) {
      throw new BadRequestException('branchId is required for non-SUPERADMIN users');
    }

    const target = await this.userModel.findById(userId).select({ roles: 1 }).exec();
    if (!target) throw new NotFoundException('User not found');

    if (target.roles?.includes('SUPERADMIN')) {
      throw new BadRequestException('SUPERADMIN cannot have a branch');
    }

    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { branchId: this.toBranchObjectId(branchId) } },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException('User not found');
    return this.sanitize(updated);
  }

  async setUsername(actor: Actor, userId: string, username: string | null) {
    // ADMIN solo edita users de su branch (opcional, recomendado)
    if (this.isAdmin(actor)) {
      if (!actor.branchId) throw new BadRequestException('ADMIN must have branchId');
      const target = await this.userModel.findById(userId).select({ branchId: 1 }).exec();
      if (!target) throw new NotFoundException('User not found');
      if (!target.branchId || String(target.branchId) !== actor.branchId) {
        throw new ForbiddenException('Cannot edit users from another branch');
      }
    }

    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { username: (username ?? '').trim() || null } },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException('User not found');
    return this.sanitize(updated);
  }

  // ---------------------------------------------
  // Refresh tokens
  // ---------------------------------------------
  async setRefreshTokenHash(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.userModel
      .findByIdAndUpdate(userId, { $set: { refreshTokenHash: hash } })
      .exec();
  }

  async clearRefreshToken(userId: string) {
    await this.userModel
      .findByIdAndUpdate(userId, { $set: { refreshTokenHash: null } })
      .exec();
  }

  async validateRefreshToken(userId: string, refreshToken: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user || !user.refreshTokenHash) return null;

    if (user.isActive === false) return null;

    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) return null;

    return {
      id: String(user._id),
      email: user.email,
      roles: user.roles,
      branchId: user.branchId ? String(user.branchId) : null,
      username: (user as any).username ?? null,
    };
  }

  // ---------------------------------------------
  // Queries
  // ---------------------------------------------
  async getUnsafeByEmail(email: string) {
    const normalized = this.normalizeEmail(email);
    return this.userModel.findOne({ email: normalized }).exec();
  }

  async getById(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select({ passwordHash: 0, refreshTokenHash: 0 })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return {
      id: String(user._id),
      email: user.email,
      username: user.username ?? null,
      roles: user.roles ?? [],
      branchId: user.branchId ? String(user.branchId) : null,
      isActive: user.isActive ?? true,
      createdAt: (user as any).createdAt,
      updatedAt: (user as any).updatedAt,
    };
  }

  async listUsers(actor: Actor, q?: { branchId?: string; role?: Role }) {
    const filter: any = {};

    // Scoping:
    // - SUPERADMIN puede listar por cualquier branchId (si viene)
    // - ADMIN solo su branch (ignora q.branchId)
    if (this.isSuper(actor)) {
      if (q?.branchId) filter.branchId = this.toBranchObjectId(q.branchId);
    } else {
      if (!actor.branchId) throw new BadRequestException('branchId missing in token');
      filter.branchId = this.toBranchObjectId(actor.branchId);
    }

    if (q?.role) filter.roles = { $in: [q.role] };

    const users = await this.userModel
      .find(filter)
      .select({ passwordHash: 0, refreshTokenHash: 0 })
      .sort({ createdAt: -1 })
      .lean();

    return users.map((u: any) => ({
      id: String(u._id),
      email: u.email,
      username: u.username ?? null,
      roles: u.roles ?? [],
      branchId: u.branchId ? String(u.branchId) : null,
      isActive: u.isActive ?? true,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }

  // ---------------------------------------------
  // Password / Active
  // ---------------------------------------------
  async setPassword(actor: Actor, userId: string, newPassword: string) {
    // ADMIN solo cambia password de su branch (opcional, recomendado)
    if (this.isAdmin(actor)) {
      if (!actor.branchId) throw new BadRequestException('ADMIN must have branchId');
      const target = await this.userModel.findById(userId).select({ branchId: 1 }).exec();
      if (!target) throw new NotFoundException('User not found');
      if (!target.branchId || String(target.branchId) !== actor.branchId) {
        throw new ForbiddenException('Cannot edit users from another branch');
      }
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    user.refreshTokenHash = null; // fuerza re-login
    await user.save();

    return { ok: true };
  }

  async setActive(actor: Actor, userId: string, isActive: boolean) {
    // ADMIN solo toca users de su branch (opcional, recomendado)
    if (this.isAdmin(actor)) {
      if (!actor.branchId) throw new BadRequestException('ADMIN must have branchId');
      const target = await this.userModel.findById(userId).select({ branchId: 1 }).exec();
      if (!target) throw new NotFoundException('User not found');
      if (!target.branchId || String(target.branchId) !== actor.branchId) {
        throw new ForbiddenException('Cannot edit users from another branch');
      }
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    user.isActive = isActive;
    if (!isActive) user.refreshTokenHash = null;
    await user.save();

    return {
      id: String(user._id),
      email: user.email,
      roles: user.roles,
      branchId: user.branchId ? String(user.branchId) : null,
      username: user.username ?? null,
      isActive: user.isActive,
    };
  }
  
}
