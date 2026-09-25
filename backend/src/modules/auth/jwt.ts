import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { JwtPayload } from '../../types';

const JWT_SECRET = config.jwtSecret || 'dev-secret-key-change-in-production-min-32-chars';
const JWT_EXPIRES_IN = '7d';

export function signToken(payload: { userId: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    return null;
  }
}
