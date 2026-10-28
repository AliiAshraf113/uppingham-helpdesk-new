const MAX_JSON_BYTES = 32 * 1024;

export function requireSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new TypeError("State-changing requests must come from the same origin.");
  }
}

export async function readJsonRequest<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new TypeError("Content-Type must be application/json.");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_JSON_BYTES)) {
    throw new TypeError("Request body exceeds the allowed size.");
  }
  if (!request.body) throw new TypeError("Request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new TypeError("Request body exceeds the allowed size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
}

export function queryParams(searchParams: URLSearchParams, allowed: readonly string[]) {
  const values: Record<string, string> = {};
  for (const [key, value] of searchParams) {
    if (!allowed.includes(key) || Object.hasOwn(values, key)) throw new TypeError("Query parameters are invalid.");
    values[key] = value;
  }
  return values;
}
