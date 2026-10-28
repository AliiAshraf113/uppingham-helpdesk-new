import type { PoolConnection } from "mariadb";
import { AuthenticationUnavailableError, ForbiddenError, UnauthenticatedError } from "../http/errors.ts";
import { getRequiredEntraTenantId, resolveEntraLocalPrincipal, UnlinkedEntraIdentityError, LocalRoleUnavailableError, type LocalPrincipal } from "../identity/entra.ts";
import { getDbPool } from "../db/pool.ts";

/** Input type reserved for an Auth.js-validated, server-side session callback. */
export type TrustedSessionIdentity = {
  entraTenantId?: unknown;
  entraObjectId?: unknown;
  entraIssuer?: unknown;
  sessionVersion?: unknown;
} | null | undefined;

/** Resolve the session's verified immutable identity; never accept a local ID or roles from a request. */
export async function requireSessionPrincipal(
  connection: PoolConnection,
  sessionIdentity: TrustedSessionIdentity,
  configuredTenantId = getRequiredEntraTenantId(),
): Promise<LocalPrincipal> {
  if (!sessionIdentity || typeof sessionIdentity.entraTenantId !== "string" || typeof sessionIdentity.entraObjectId !== "string" || typeof sessionIdentity.entraIssuer !== "string" || !Number.isSafeInteger(sessionIdentity.sessionVersion) || (sessionIdentity.sessionVersion as number) < 1) {
    throw new UnauthenticatedError();
  }
  const principal = await resolveEntraLocalPrincipal(connection, {
    tid: sessionIdentity.entraTenantId,
    oid: sessionIdentity.entraObjectId,
    iss: sessionIdentity.entraIssuer,
  }, configuredTenantId).catch((error: unknown) => {
    if (error instanceof UnlinkedEntraIdentityError) throw new UnauthenticatedError();
    if (error instanceof LocalRoleUnavailableError) throw new ForbiddenError("Your local Helpdesk role is not active.");
    if (error instanceof Error && /identity|issuer|tenant|object ID|claim/i.test(error.message)) throw new UnauthenticatedError();
    throw error;
  });
  if (principal.sessionVersion !== sessionIdentity.sessionVersion) throw new UnauthenticatedError();
  return principal;
}

export async function requireAuthenticatedPrincipal(): Promise<LocalPrincipal> {
  let tenantId: string;
  try {
    tenantId = getRequiredEntraTenantId();
    // Keep the dependency fail-closed before Auth.js tries to process cookies.
    const { getAuthEnvironment } = await import("./auth-config.ts");
    getAuthEnvironment();
  } catch {
    throw new AuthenticationUnavailableError();
  }
  let session;
  try {
    const { auth } = await import("../../../auth.ts");
    session = await auth();
  } catch {
    throw new UnauthenticatedError();
  }
  if (!session?.authIdentity) throw new UnauthenticatedError();
  const connection = await getDbPool().getConnection();
  try {
    return await requireSessionPrincipal(connection, session.authIdentity, tenantId);
  } finally {
    await connection.release();
  }
}
