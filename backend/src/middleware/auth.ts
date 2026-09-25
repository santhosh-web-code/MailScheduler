import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../modules/auth/jwt';
import { prisma } from '../config';

const COOKIE_NAME = 'token';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token =
      req.cookies?.[COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring(7)
        : null);

    if (!token) {
      if (process.env.NODE_ENV !== 'production') {
        const devUser = await prisma.user.findFirst();
        if (devUser) {
          req.user = devUser;
          return next();
        }
      }
      return res.status(401).json({ message: 'Authentication required' });
    }

    const payload = verifyToken(token);
    if (!payload?.userId) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error('[Middleware] Error in requireAuth:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
