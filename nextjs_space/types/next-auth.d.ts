import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Legacy `users.id` — the attribution key for every write. */
      id: number;
      name?: string | null;
      email?: string | null;
      login?: string;
      role?: string;
    };
  }
  interface User {
    login?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: number;
    login?: string;
    role?: string;
  }
}
