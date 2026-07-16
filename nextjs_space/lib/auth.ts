import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Natywny login (login + hasło) — BEZ SSO/Entra ID. Zgodnie z legacy.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Login i hasło",
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Hasło", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.login || !credentials.password) return null;
        const user = await prisma.user.findUnique({
          where: { login: credentials.login },
          include: { role: true },
        });
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.fullName,
          email: user.email ?? undefined,
          login: user.login,
          role: user.role.code,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.login = (user as { login?: string }).login;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string | undefined;
        session.user.login = token.login as string | undefined;
      }
      return session;
    },
  },
};
