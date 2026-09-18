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
        });
        // Placeholder rows imported from the legacy directory carry no password and
        // cannot sign in until an administrator activates the account.
        if (!user || !user.active || !user.passwordHash) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

        const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
        return {
          id: String(user.id),
          name: fullName || user.login || String(user.id),
          email: user.email ?? undefined,
          login: user.login ?? undefined,
          role: user.isAdmin ? "admin" : "user",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // The numeric legacy id is what every write is attributed to (modifiedById,
        // ContractHistory.userId, the contract ACL), so it has to survive in the token.
        token.uid = Number(user.id);
        token.role = (user as { role?: string }).role;
        token.login = (user as { login?: string }).login;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as number;
        session.user.role = token.role as string | undefined;
        session.user.login = token.login as string | undefined;
      }
      return session;
    },
  },
};
