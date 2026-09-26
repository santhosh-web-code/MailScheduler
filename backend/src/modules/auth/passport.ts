import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { config, prisma } from '../../config';

const clientID = config.google.clientId || 'GOOGLE_CLIENT_ID_PLACEHOLDER';
const clientSecret = config.google.clientSecret || 'GOOGLE_CLIENT_SECRET_PLACEHOLDER';
const callbackURL = config.google.callbackUrl || 'http://localhost:5000/auth/google/callback';

if (!config.google.clientId || !config.google.clientSecret) {
  console.warn(
    '[Passport] Google OAuth Client ID or Client Secret is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.'
  );
}

passport.use(
  new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      passReqToCallback: false,
    },
    async (_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email found in Google profile'), undefined);
        }

        const name = profile.displayName || profile.name?.givenName || email.split('@')[0];
        const avatarUrl =
          profile.photos?.[0]?.value ||
          (profile as any)._json?.picture ||
          (profile as any)._json?.avatar_url ||
          null;

        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: {
            name,
            avatarUrl,
            email,
          },
          create: {
            googleId: profile.id,
            email,
            name,
            avatarUrl,
          },
        });

        return done(null, user);
      } catch (error) {
        console.error('[Passport] Error in GoogleStrategy verify callback:', error);
        return done(error as Error, undefined);
      }
    }
  )
);

export default passport;
