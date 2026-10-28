# Authentication setup

Auth.js `5.0.0-beta.32` is wired to the Microsoft Entra ID provider. The application uses Auth.js's encrypted JWT session cookie (HttpOnly, Secure on HTTPS, SameSite=Lax) with an eight-hour maximum age. Every protected request resolves `(provider, tenant, object ID)` to a pre-existing active local account and reloads roles and permissions from MariaDB. The local `session_version` must match the value captured at sign-in. No user is created or linked by email, UPN, or display name.

## Intended Entra configuration

Use the Auth.js Microsoft Entra ID OIDC provider with a single-tenant issuer. The project callback is `https://uc-eg.com/helpdesk/api/auth/callback/microsoft-entra-id`. `AUTH_URL` is the Auth.js endpoint base, including both the Next.js base path and Auth.js route: `https://uc-eg.com/helpdesk/api/auth`. The provider requires `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, and `AUTH_MICROSOFT_ENTRA_ID_ISSUER`; `ENTRA_TENANT_ID` separately pins identity resolution. Use the exact same tenant GUID in `ENTRA_TENANT_ID` and issuer URL.

Placeholders belong only in setup instructions. Never commit real client secrets, tenant IDs, allowlists, or `AUTH_SECRET`. Use the tenant-specific issuer `https://login.microsoftonline.com/<TENANT_ID>/v2.0`; do not use `common` for this internal application. `AUTH_SECRET` must contain at least 32 characters and must be generated privately. Production `AUTH_URL` must use HTTPS. Configuration is validated at request time so builds can run without production secrets, while auth requests fail closed if configuration is incomplete.

## Authorization model to implement

- Auth.js validates OIDC signature, issuer metadata, audience, state, nonce, and PKCE. The callback then validates the verified `tid`, `oid`, and `iss` claims against the configured tenant and Microsoft issuer.
- The callback requests only `openid profile`; it does not request Graph `User.Read` or fetch profile photos.
- Email, UPN, display name, and browser state are not identity keys.
- Link the verified `(provider, tenant_id, oid)` to `app_user_identities`, require an active `app_users` row, and load active role assignments from MariaDB on protected server operations.
- Never put roles in a client-trusted session. Ticket services must receive an actor built by server-side session and database resolution.
- Use the Auth.js encrypted JWT cookie with an eight-hour maximum age, `HttpOnly`, `SameSite=Lax`, and `Secure` when `AUTH_URL` is HTTPS. Auth.js's Entra provider enables its state, nonce, and PKCE checks. Auth.js redirects are restricted to same-origin by its default redirect callback.
- Group-based onboarding is unresolved. The school must supply approved group object IDs and the handling policy for group-claim overage. Fail closed when claims are missing/overage rather than treating an email domain as authorization.

## Local identity resolution and protected workflows

`src/server/identity/entra.ts` maps `(microsoft-entra-id, tid, oid)` to an already-linked active local identity. On every protected server request, roles and permissions are loaded from active MariaDB assignment tables; `session_version` is compared with the signed session snapshot so incrementing the database value invalidates old sessions. Ticket list/detail/create/status/assignment/comments APIs and ticket pages require this server principal. Requester scope and internal-note confidentiality remain enforced in ticket services and SQL. The browser never supplies its own user ID or role.

Offline tests exercise callback claim validation, missing/malformed sessions, local-account linking, role resolution, version revocation, requester scoping, internal-note filtering, and protected API behavior through fake connections. They do not verify a real Entra tenant, database, callback registration, or cPanel proxy.

## Required configuration and remaining verification

- A tenant administrator must register the Entra redirect URI above, supply the tenant/application IDs and client secret through the host's protected environment configuration, and confirm the auth proxy host behavior.
- An administrator must provision local `app_users`, `app_user_identities`, role assignments, and required reference data in the intended database. This project has not connected to or modified the live database.
- The current cPanel Node/Passenger runtime must be tested with the callback and Secure cookie behavior. No cPanel sign-in test has occurred.
- Decide and configure group-based onboarding separately. No group claims are used to grant roles; database role assignments are authoritative.
- The deployment must provide `DATABASE_URL`, `ENTRA_TENANT_ID`, `AUTH_SECRET`, `AUTH_URL`, and the three Entra provider variables in its secret/environment settings. Never place real values in `.env.example` or commit them.

Official reference: [Auth.js Microsoft Entra ID provider](https://authjs.dev/getting-started/providers/microsoft-entra-id), [Auth.js Next.js API reference](https://authjs.dev/reference/nextjs), [Auth.js protecting resources](https://authjs.dev/getting-started/session-management/protecting), [Microsoft identity token claims](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference).
