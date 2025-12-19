import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, Role } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  // ... (tu create normal para register si lo querés mantener)
  async create(email: string, password: string, roles: Role[] = ['USER']) {
    const normalized = email.toLowerCase().trim();
    const exists = await this.userModel.exists({ email: normalized });
    if (exists) throw new Error('Email already in use'); // o ConflictException

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await this.userModel.create({
      email: normalized,
      passwordHash,
      roles,
    });
    return this.sanitize(created);
  }

  async adminCreateUser(
    email: string,
    password: string,
    roles: Role[] = ['USER'],
  ) {
    return this.create(email, password, roles);
  }

  async updateRoles(userId: string, roles: Role[]) {
    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: { roles } }, { new: true })
      .exec();
    if (!updated) throw new Error('User not found');
    return this.sanitize(updated);
  }

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

    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) return null;

    return { id: String(user._id), email: user.email, roles: user.roles };
  }

  async getUnsafeByEmail(email: string) {
    const normalized = email.toLowerCase().trim();
    return this.userModel.findOne({ email: normalized }).exec();
  }

  private sanitize(doc: UserDocument) {
    const obj = doc.toObject();
    const { passwordHash, refreshTokenHash, ...safe } = obj as any;
    return safe;
  }
  async listUsers() {
    const users = await this.userModel
      .find({})
      .select({ passwordHash: 0, refreshTokenHash: 0 })
      .sort({ createdAt: -1 })
      .lean();

    return users.map((u: any) => ({
      id: String(u._id),
      email: u.email,
      roles: u.roles,
      isActive: u.isActive ?? true,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }

  async setPassword(userId: string, newPassword: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    const passwordHash = await bcrypt.hash(newPassword, 10);

    user.passwordHash = passwordHash;
    user.refreshTokenHash = null; // ✅ fuerza re-login
    await user.save();

    return { ok: true };
  }

  async setActive(userId: string, isActive: boolean) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    user.isActive = isActive;
    if (!isActive) user.refreshTokenHash = null; // ✅ mata sesión
    await user.save();

    return {
      id: String(user._id),
      email: user.email,
      roles: user.roles,
      isActive: user.isActive,
    };
  }
}
