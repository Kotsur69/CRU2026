import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
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
    login?: string;
    role?: string;
  }
}
