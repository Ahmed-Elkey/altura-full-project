import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedRequest } from './auth-user';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtAuthGuard: JwtAuthGuard) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const rawHeader = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!rawHeader) {
      return true;
    }

    return this.jwtAuthGuard.canActivate(context);
  }
}
