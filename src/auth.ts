import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

const prismaAdapter = PrismaAdapter(prisma);

const adapter: Adapter = {
  ...prismaAdapter,
  // Google is only used to sign in, we never call Google APIs on the user's
  // behalf, so there is no reason to store their OAuth tokens.
  linkAccount: (account) =>
    prismaAdapter.linkAccount!({
      ...account,
      access_token: undefined,
      refresh_token: undefined,
      id_token: undefined,
    }),
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [Google],
  // Database sessions (the default with an adapter) can be revoked server-side,
  // signing out deletes the row instead of waiting for a JWT to expire.
  session: { strategy: "database" },
  pages: { signIn: "/" },
  callbacks: {
    // `session` here carries the raw DB row (including the session token) and
    // this object is what /api/auth/session returns, so only pick what the
    // UI actually needs.
    session({ session, user }) {
      return {
        expires: session.expires,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      };
    },
  },
});
