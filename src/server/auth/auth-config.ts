import { getRequiredEntraTenantId, type VerifiedEntraClaims } from "../identity/entra.ts";

export type AuthIdentity = {
  entraTenantId: string;
  entraObjectId: string;
  entraIssuer: string;
  sessionVersion: number;
};

export type AuthEnvironment = {
  secret: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
  issuer: string;
  authUrl: URL;
};

export function getAuthEnvironment(env: NodeJS.ProcessEnv = process.env): AuthEnvironment {
  if (!env.ENTRA_TENANT_ID) throw new Error("Entra tenant configuration is missing or invalid.");
  const tenantId = getRequiredEntraTenantId(env.ENTRA_TENANT_ID);
  const clientId = env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "";
  const clientSecret = env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "";
  const issuerValue = env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "";
  const secret = env.AUTH_SECRET ?? "";
  const authUrlValue = env.AUTH_URL ?? "";
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!guid.test(clientId) || !clientSecret || secret.length < 32) throw new Error("Auth.js server configuration is incomplete.");
  const issuer = new URL(issuerValue);
  if (issuer.origin !== "https://login.microsoftonline.com"
      || issuer.pathname.replace(/\/$/, "").toLowerCase() !== `/${tenantId}/v2.0`
      || issuer.search || issuer.hash || issuer.username || issuer.password) {
    throw new Error("The Entra issuer must be the configured single tenant issuer.");
  }
  const authUrl = new URL(authUrlValue);
  if (authUrl.pathname.replace(/\/$/, "") !== "/helpdesk/api/auth"
      || authUrl.search || authUrl.hash || authUrl.username || authUrl.password
      || (env.NODE_ENV === "production" && authUrl.protocol !== "https:")) {
    throw new Error("AUTH_URL must be the canonical Auth.js endpoint under /helpdesk/api/auth.");
  }
  return { secret, clientId, clientSecret, tenantId, issuer: issuer.href.replace(/\/$/, ""), authUrl };
}

/** Validate claims only after Auth.js has verified the OIDC token signature, issuer, audience, nonce, and state. */
export function validateAuthIdentity(claims: VerifiedEntraClaims, configuredTenantId = getRequiredEntraTenantId()) {
  const tenantId = typeof claims.tid === "string" ? claims.tid.toLowerCase() : "";
  const objectId = typeof claims.oid === "string" ? claims.oid.toLowerCase() : "";
  const issuer = typeof claims.iss === "string" ? claims.iss : "";
  const expectedTenant = getRequiredEntraTenantId(configuredTenantId);
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!guid.test(tenantId) || tenantId !== expectedTenant) throw new Error("Identity tenant is not allowed.");
  if (!guid.test(objectId)) throw new Error("Identity object ID is required.");
  const parsed = new URL(issuer);
  if (parsed.origin !== "https://login.microsoftonline.com"
      || parsed.pathname.toLowerCase() !== `/${expectedTenant}/v2.0`
      || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error("Identity issuer is not allowed.");
  }
  return { tid: tenantId, oid: objectId, iss: issuer };
}
