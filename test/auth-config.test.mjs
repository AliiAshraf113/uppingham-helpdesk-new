import assert from "node:assert/strict";
import test from "node:test";
import { getAuthEnvironment, validateAuthIdentity } from "../src/server/auth/auth-config.ts";

const tenantId = "11111111-2222-4333-8444-555555555555";
const objectId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const env = {
  NODE_ENV: "production",
  ENTRA_TENANT_ID: tenantId,
  AUTH_MICROSOFT_ENTRA_ID_ID: "22222222-3333-4444-8555-666666666666",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "test-only-not-a-real-secret",
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: `https://login.microsoftonline.com/${tenantId}/v2.0/`,
  AUTH_SECRET: "x".repeat(48),
  AUTH_URL: "https://uc-eg.com/helpdesk/api/auth",
};

test("Auth.js config requires a single tenant, HTTPS base-path endpoint, client credentials and strong secret", () => {
  const config = getAuthEnvironment(env);
  assert.equal(config.tenantId, tenantId);
  assert.equal(config.issuer, `https://login.microsoftonline.com/${tenantId}/v2.0`);
  assert.equal(config.authUrl.pathname, "/helpdesk/api/auth");
  assert.throws(() => getAuthEnvironment({ ...env, AUTH_URL: "https://uc-eg.com/api/auth" }), /AUTH_URL/);
  assert.throws(() => getAuthEnvironment({ ...env, AUTH_URL: "http://uc-eg.com/helpdesk/api/auth" }), /AUTH_URL/);
  assert.throws(() => getAuthEnvironment({ ...env, AUTH_SECRET: "short" }), /incomplete/);
  assert.throws(() => getAuthEnvironment({ ...env, AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/common/v2.0" }), /single tenant/);
  assert.throws(() => getAuthEnvironment({ ...env, ENTRA_TENANT_ID: "" }), /tenant configuration/);
});

test("verified identity accepts only matching tenant, issuer and immutable object GUID", () => {
  assert.deepEqual(validateAuthIdentity({ tid: tenantId, oid: objectId, iss: `https://login.microsoftonline.com/${tenantId}/v2.0` }, tenantId), {
    tid: tenantId, oid: objectId, iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  });
  assert.throws(() => validateAuthIdentity({ tid: tenantId, oid: objectId, iss: `https://login.microsoftonline.com/${tenantId}/v1.0` }, tenantId), /issuer/);
  assert.throws(() => validateAuthIdentity({ tid: tenantId, oid: "mutable@example.edu", iss: `https://login.microsoftonline.com/${tenantId}/v2.0` }, tenantId), /object ID/);
  assert.throws(() => validateAuthIdentity({ tid: "99999999-2222-4333-8444-555555555555", oid: objectId, iss: `https://login.microsoftonline.com/${tenantId}/v2.0` }, tenantId), /tenant/);
});
