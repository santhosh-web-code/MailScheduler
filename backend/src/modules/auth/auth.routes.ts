import { Router, Request, Response } from 'express';
import passport from './passport';
import { config, prisma } from '../../config';
import { signToken, verifyToken } from './jwt';

export const authRouter = Router();

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; 

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: COOKIE_MAX_AGE,
  path: '/',
});

authRouter.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    prompt: 'select_account',
  })
);

authRouter.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${config.frontendUrl}/login?error=oauth_failed`,
  }),
  (req: Request, res: Response) => {
    try {
      const user = req.user as { id: string } | undefined;
      if (!user?.id) {
        return res.redirect(`${config.frontendUrl}/login?error=missing_user`);
      }

      const token = signToken({ userId: user.id });

      res.cookie(COOKIE_NAME, token, getCookieOptions());
      return res.redirect(`${config.frontendUrl}/dashboard`);
    } catch (error) {
      console.error('[Auth] Error setting auth cookie in callback:', error);
      return res.redirect(`${config.frontendUrl}/login?error=server_error`);
    }
  }
);

authRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const token =
      req.cookies?.[COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring(7)
        : null);

    let userId: string | null = null;
    if (token) {
      const payload = verifyToken(token);
      if (payload?.userId) {
        userId = payload.userId;
      }
    }

    if (!userId && process.env.NODE_ENV !== 'production') {
      const devUser =
        (await prisma.user.findFirst({
          where: { email: process.env.SMTP_FROM_EMAIL || 'santhoshnanisanka@gmail.com' },
        })) || (await prisma.user.findFirst());
      if (devUser) {
        userId = devUser.id;
      }
    }

    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: 'User record not found' });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        photoUrl: user.avatarUrl,
        picture: user.avatarUrl,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[Auth] Error in GET /auth/me:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  });
  return res.json({ success: true, message: 'Logged out successfully' });
});

export default authRouter;
