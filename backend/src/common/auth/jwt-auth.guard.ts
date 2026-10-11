import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtTokenService } from '../security/jwt-token.service';
import { AuthenticatedRequest } from './auth-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const rawHeader = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!rawHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer access token is required');
    }

    const token = rawHeader.slice('Bearer '.length).trim();
    const payload = this.jwtTokenService.verify(token);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, authVersion: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }

    if (user.authVersion !== payload.ver) {
      throw new UnauthorizedException('Access token is no longer valid');
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    return true;
  }
}
