import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, UserStatus } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtTokenService } from '../../common/security/jwt-token.service';
import { PasswordService } from '../../common/security/password.service';
import { parseDuration } from '../../common/security/duration';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponse, AuthTokensResponse, PublicUser } from './auth.types';

interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

interface UserWithRefreshState {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: User['role'];
  status: User['status'];
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authVersion: number;
}

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly jwtTokenService: JwtTokenService,
  ) {
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.refreshTtlMs = parseDuration(this.config.get<string>('JWT_REFRESH_TTL', '30d'));
  }

  async register(dto: RegisterDto, metadata: SessionMetadata = {}): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          wishlist: { create: {} },
        },
      });
    } catch (error) {
      if (this.isPrismaUniqueConstraintError(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    const tokens = await this.createSession(user, metadata);
    return { user: this.toPublicUser(user), ...tokens };
  }

  async login(dto: LoginDto, metadata: SessionMetadata = {}): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !(await this.passwordService.verify(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.assertActive(user.status);

    const updatedUser = { ...user, lastLoginAt: new Date() };
    const tokens = await this.createSession(updatedUser, metadata, true);
    return { user: this.toPublicUser(updatedUser), ...tokens };
  }

  async refresh(rawRefreshToken: string, metadata: SessionMetadata = {}): Promise<AuthResponse> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    this.assertActive(storedToken.user.status);

    const newRefreshToken = this.generateRefreshToken();
    const newTokenHash = this.hashRefreshToken(newRefreshToken);
    const newExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Lock the user before refresh rows, matching reset's lock order. The
      // checked snapshot must still be current before issuing another session.
      const current = await tx.user.updateMany({
        where: { id: storedToken.user.id, status: UserStatus.ACTIVE, authVersion: storedToken.user.authVersion, passwordHash: storedToken.user.passwordHash },
        data: { authVersion: storedToken.user.authVersion },
      });
      if (current.count !== 1) throw new UnauthorizedException('Session has expired');
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          lastUsedAt: now,
          revokedByIp: metadata.ipAddress,
        },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException('Refresh token has already been used');
      }

      await tx.refreshToken.create({
        data: {
          userId: storedToken.userId,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
          createdByIp: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    });

    const access = this.jwtTokenService.issue({
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
      ver: storedToken.user.authVersion,
    });

    return {
      user: this.toPublicUser(storedToken.user),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      accessTokenExpiresInSeconds: access.expiresInSeconds,
      refreshToken: newRefreshToken,
      refreshTokenExpiresAt: newExpiresAt,
    };
  }

  async logout(rawRefreshToken: string | undefined, ipAddress?: string): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(rawRefreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedByIp: ipAddress,
      },
    });
  }

  async logoutAll(userId: string, ipAddress?: string): Promise<number> {
    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { authVersion: { increment: 1 } },
      });
      const result = await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedByIp: ipAddress },
      });
      return result.count;
    });
    return revokedSessions;
  }

  private async createSession(user: UserWithRefreshState, metadata: SessionMetadata, login = false): Promise<AuthTokensResponse> {
    const access = this.jwtTokenService.issue({
      sub: user.id,
      email: user.email,
      role: user.role,
      ver: user.authVersion,
    });

    const refreshToken = this.generateRefreshToken();
    const refreshTokenExpiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.prisma.$transaction(async tx => {
      const current = await tx.user.updateMany({
        where: { id: user.id, status: UserStatus.ACTIVE, authVersion: user.authVersion, passwordHash: user.passwordHash },
        data: login ? { lastLoginAt: user.lastLoginAt } : { authVersion: user.authVersion },
      });
      if (current.count !== 1) throw new UnauthorizedException('Invalid email or password');
      await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        createdByIp: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
      });
    });

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      accessTokenExpiresInSeconds: access.expiresInSeconds,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshSecret).update(token).digest('hex');
  }

  private assertActive(status: UserStatus): void {
    if (status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toPublicUser(user: UserWithRefreshState): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002',
    );
  }
}
