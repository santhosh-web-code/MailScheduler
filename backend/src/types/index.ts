import { User as PrismaUser } from '@prisma/client';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface User extends PrismaUser {}
    interface Request {
      user?: PrismaUser;
    }
  }
}
