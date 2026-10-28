export class AuthenticationUnavailableError extends Error {
  constructor() {
    super("Microsoft Entra authentication is not configured for this build.");
    this.name = "AuthenticationUnavailableError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sign in is required.");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "The requested record was not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof AuthenticationUnavailableError) {
    return Response.json({ error: "authentication_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof UnauthenticatedError) {
    return Response.json({ error: "authentication_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof NotFoundError) {
    return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof TypeError || error instanceof SyntaxError) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ error: "internal_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
