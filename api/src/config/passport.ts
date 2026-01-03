import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { prisma } from '../utils/prisma';
import dotenv from 'dotenv';

dotenv.config();

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

const findOrCreateUser = async (profile: any, provider: 'google' | 'github') => {
  const email = profile.emails?.[0]?.value;
  const firstName = profile.name?.givenName || profile.username || 'User';
  const lastName = profile.name?.familyName || '';
  const providerId = profile.id;

  if (!email) {
    throw new Error('No email found in OAuth profile');
  }

  // 1. Check if user exists by Provider ID
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        provider === 'google' ? { googleId: providerId } : undefined,
        provider === 'github' ? { githubId: providerId } : undefined,
      ].filter(Boolean) as any,
    },
  });

  if (user) {
    return user;
  }

  // 2. Check if user exists by Email (Account Linking)
  user = await prisma.user.findUnique({
    where: { email },
  });

  if (user) {
    // Link the account
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        [provider === 'google' ? 'googleId' : 'githubId']: providerId,
      },
    });
    return user;
  }

  // 3. Create new user if not exists
  return await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email,
        firstName,
        lastName,
        [provider === 'google' ? 'googleId' : 'githubId']: providerId,
      },
    });

    // Create default organization
    const organization = await tx.organization.create({
      data: {
        name: `${firstName}'s Organization`,
        createdById: newUser.id,
      },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: newUser.id,
        role: 'OWNER',
        isActive: true,
      },
    });

    return newUser;
  });
};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateUser(profile, 'google');
          done(null, user);
        } catch (error) {
          done(error as any, undefined);
        }
      }
    )
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: '/api/auth/github/callback',
        scope: ['user:email'],
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const user = await findOrCreateUser(profile, 'github');
          done(null, user);
        } catch (error) {
          done(error as any, undefined);
        }
      }
    )
  );
}

export default passport;
