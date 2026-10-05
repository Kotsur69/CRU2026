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
    /** `User.sessionVersion` at sign-in; a later bump revokes the session. */
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: number;
    login?: string;
    role?: string;
    /** Session version captured at sign-in. */
    sv?: number;
    /** Epoch ms of the sign-in, for the absolute timeout. */
    authTime?: number;
  }
}
