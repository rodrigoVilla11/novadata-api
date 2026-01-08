import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Role } from "../users/schemas/user.schema";

type JwtPayload = {
  sub: string;
  email: string;
  roles: Role[];
  branchId: string | null;
  username?: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:
        process.env.JWT_ACCESS_SECRET ||
        process.env.JWT_SECRET ||
        "access_dev",
    });
  }

  validate(payload: JwtPayload) {
    return {
      sub: payload.sub,
      userId: payload.sub,
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      branchId: payload.branchId ?? null,     // ✅ CLAVE
      username: payload.username ?? null,     // opcional
    };
  }
}
