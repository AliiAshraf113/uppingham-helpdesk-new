import NextAuth, { type NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { resolveEntraLocalPrincipal, type VerifiedEntraClaims } from "./src/server/identity/entra.ts";
import { getDbPool } from "./src/server/db/pool.ts";
import { getAuthEnvironment, validateAuthIdentity, type AuthIdentity } from "./src/server/auth/auth-config.ts";

function configuration(): NextAuthConfig {
  const env = getAuthEnvironment();

  return {
    secret: env.secret,
    trustHost: true,
    basePath: "/helpdesk/api/auth",
    useSecureCookies: env.authUrl.protocol === "https:",
    session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 15 * 60 },
    providers: [MicrosoftEntraID({
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      issuer: env.issuer,
      authorization: { params: { scope: "openid profile" } },
      profile(profile) {
        return { id: profile.sub, name: profile.name ?? null, email: null, image: null };
      },
    })],
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== "microsoft-entra-id" || !profile) return false;
        try {
          const identity = validateAuthIdentity(profile as unknown as VerifiedEntraClaims, env.tenantId);
          const connection = await getDbPool().getConnection();
          try {
            await resolveEntraLocalPrincipal(connection, identity, env.tenantId);
          } finally {
            await connection.release();
          }
          return true;
        } catch {
          return false;
        }
      },
      async jwt({ token, account, profile }) {
        if (!account) return token;
        if (account.provider !== "microsoft-entra-id" || !profile) return null;
        const identity = validateAuthIdentity(profile as unknown as VerifiedEntraClaims, env.tenantId);
        const connection = await getDbPool().getConnection();
        try {
          const principal = await resolveEntraLocalPrincipal(connection, identity, env.tenantId);
          token.helpdeskIdentity = {
            entraTenantId: identity.tid,
            entraObjectId: identity.oid,
            entraIssuer: identity.iss,
            sessionVersion: principal.sessionVersion,
          } satisfies AuthIdentity;
          return token;
        } finally {
          await connection.release();
        }
      },
      async session({ session, token }) {
        const identity = token.helpdeskIdentity as AuthIdentity | undefined;
        if (identity) session.authIdentity = identity;
        return session;
      },
    },
  };
}

const nextAuth = NextAuth(() => configuration());

export const { handlers, auth, signIn, signOut } = nextAuth;
