import { UserRole, UserStatus } from '@prisma/client';

export interface PublicUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokensResponse {
  accessToken: string;
  accessTokenExpiresAt: Date;
  accessTokenExpiresInSeconds: number;
  refreshToken?: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthResponse extends AuthTokensResponse {
  user: PublicUser;
}
