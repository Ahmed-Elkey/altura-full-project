import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { AuthUser, AuthenticatedRequest } from './auth-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new InternalServerErrorException('Authenticated user context is unavailable');
    }
    return request.user;
  },
);
