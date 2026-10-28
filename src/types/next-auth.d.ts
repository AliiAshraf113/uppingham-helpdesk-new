import type { DefaultSession } from "next-auth";
import type { AuthIdentity } from "../server/auth/auth-config";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"];
    authIdentity?: AuthIdentity;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    helpdeskIdentity?: AuthIdentity;
  }
}
