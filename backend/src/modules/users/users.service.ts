import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../common/security/password.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const data: Record<string, unknown> = {
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
    };
    if (dto.email !== undefined && dto.email.trim().toLowerCase() !== user.email.toLowerCase()) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const taken = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (taken) {
        throw new ConflictException('This email is already in use');
      }
      data.email = normalizedEmail;
      data.emailVerifiedAt = null;
    }
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: publicUserSelect,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, authVersion: true, status: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const validCurrentPassword = await this.passwordService.verify(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!validCurrentPassword) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const samePassword = await this.passwordService.verify(dto.newPassword, user.passwordHash);
    if (samePassword) {
      throw new UnauthorizedException('New password must be different from the current password');
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, passwordHash: user.passwordHash, authVersion: user.authVersion, status: 'ACTIVE' },
        data: {
          passwordHash,
          authVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new UnauthorizedException('Current password is incorrect');

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

}
