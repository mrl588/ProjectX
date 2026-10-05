import type { Express } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { encryptSecret } from "./crypto.js";
import { prisma } from "./db.js";
import { seedUser } from "./day.js";
import { createSession } from "./session.js";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export function mountGoogleAuth(app: Express): void {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL;
  if (!clientID || !clientSecret || !callbackURL) {
    app.get("/api/auth/google", (_req, res) => {
      res.status(501).json({ error: "Google sign-in is not configured. Use the dev login locally." });
    });
    return;
  }

  passport.use(
    new GoogleStrategy(
      { clientID, clientSecret, callbackURL },
      async (
        _accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (error: Error | null, user?: Express.User) => void,
      ) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            done(new Error("Google account has no email"));
            return;
          }
          const name = profile.displayName || email;
          const user = await prisma.user.upsert({
            where: { email },
            update: {
              name,
              googleSub: profile.id,
              ...(refreshToken ? { refreshToken: encryptSecret(refreshToken) } : {}),
            },
            create: {
              email,
              name,
              googleSub: profile.id,
              refreshToken: refreshToken ? encryptSecret(refreshToken) : null,
            },
          });
          await seedUser(user.id);
          done(null, { id: user.id });
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );

  app.get("/api/auth/google", (req, res, next) => {
    passport.authenticate("google", {
      scope: SCOPES,
      session: false,
      accessType: "offline",
      prompt: "consent",
    } as passport.AuthenticateOptions)(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", { session: false }, async (error: Error | null, authUser: { id: string } | false) => {
      if (error || !authUser) {
        res.redirect(`${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/login`);
        return;
      }
      await createSession(res, authUser.id);
      res.redirect(process.env.WEB_ORIGIN ?? "http://localhost:5173");
    })(req, res, next);
  });
}
