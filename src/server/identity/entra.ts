import type { PoolConnection } from "mariadb";

export type VerifiedEntraClaims = {
  tid?: unknown;
  oid?: unknown;
  iss?: unknown;
};

export type LocalPrincipal = {
  userId: number;
  displayName: string | null;
  sessionVersion: number;
  roles: readonly string[];
  permissions: readonly string[];
};

export class UnlinkedEntraIdentityError extends Error {
  constructor() { super("No active local account is linked to this Entra identity."); this.name = "UnlinkedEntraIdentityError"; }
}

export class LocalRoleUnavailableError extends Error {
  constructor() { super("Local account has no active Helpdesk role."); this.name = "LocalRoleUnavailableError"; }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getRequiredEntraTenantId(value = process.env.ENTRA_TENANT_ID) {
  if (!value || !UUID_PATTERN.test(value)) {
    throw new Error("Entra tenant configuration is missing or invalid.");
  }
  return value.toLowerCase();
}

function validateVerifiedClaims(claims: VerifiedEntraClaims, configuredTenantId: string) {
  if (!UUID_PATTERN.test(configuredTenantId)) throw new Error("Entra tenant configuration is invalid.");
  const tenantId = typeof claims.tid === "string" ? claims.tid.toLowerCase() : "";
  const objectId = typeof claims.oid === "string" ? claims.oid.toLowerCase() : "";
  const issuer = typeof claims.iss === "string" ? claims.iss : "";
  if (!UUID_PATTERN.test(tenantId) || tenantId !== configuredTenantId.toLowerCase()) {
    throw new Error("Identity is not from the configured Entra tenant.");
  }
  if (!UUID_PATTERN.test(objectId)) throw new Error("Entra identity is missing a valid object ID.");

  let parsedIssuer: URL;
  try {
    parsedIssuer = new URL(issuer);
  } catch {
    throw new Error("Entra identity issuer is invalid.");
  }
  const expectedPath = `/${tenantId}/v2.0`;
  if (parsedIssuer.origin !== "https://login.microsoftonline.com" || parsedIssuer.username || parsedIssuer.password
      || parsedIssuer.pathname.toLowerCase() !== expectedPath || parsedIssuer.search || parsedIssuer.hash) {
    throw new Error("Entra identity issuer does not match the configured tenant.");
  }
  return { tenantId, objectId };
}

/**
 * Resolve an already provider-verified Entra identity to a pre-provisioned local account.
 * This function does not verify OAuth tokens; the caller must supply claims verified by Auth.js.
 * It never creates accounts or grants roles from email, UPN, or client-provided values.
 */
export async function resolveEntraLocalPrincipal(
  connection: PoolConnection,
  claims: VerifiedEntraClaims,
  configuredTenantId = getRequiredEntraTenantId(),
): Promise<LocalPrincipal> {
  const { tenantId, objectId } = validateVerifiedClaims(claims, configuredTenantId);
  const identities = await connection.execute<Array<{ user_id: number; display_name: string | null; session_version: number }>>(
    "SELECT u.user_id, u.display_name, u.session_version FROM app_user_identities i JOIN app_users u ON u.user_id = i.user_id WHERE i.provider_key = 'microsoft-entra-id' AND i.tenant_id = ? AND i.provider_subject = ? AND u.is_active = TRUE LIMIT 1",
    [tenantId, objectId],
  );
  const identity = identities[0];
  if (!identity || !Number.isSafeInteger(identity.user_id) || identity.user_id < 1 || !Number.isSafeInteger(identity.session_version) || identity.session_version < 1) {
    throw new UnlinkedEntraIdentityError();
  }

  const roleRows = await connection.execute<Array<{ role_key: string; permission_key: string }>>(
    "SELECT DISTINCT r.role_key, rp.permission_key FROM app_user_roles ur JOIN app_roles r ON r.role_id = ur.role_id JOIN app_role_permissions rp ON rp.role_id = r.role_id JOIN app_users u ON u.user_id = ur.user_id WHERE ur.user_id = ? AND u.is_active = TRUE AND r.is_active = TRUE",
    [identity.user_id],
  );
  const roles = [...new Set(roleRows.map(({ role_key }) => role_key))];
  const permissions = [...new Set(roleRows.map(({ permission_key }) => permission_key))];
  if (roles.length === 0 || permissions.length === 0) {
    throw new LocalRoleUnavailableError();
  }
  return { userId: identity.user_id, displayName: identity.display_name, sessionVersion: identity.session_version, roles, permissions };
}
