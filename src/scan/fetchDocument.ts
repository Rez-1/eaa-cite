/**
 * Fetches one main-frame document for the scanner, without following
 * redirects and with a size cap. The scanner fulfils the browser's request
 * with the result, so a hostile server cannot stream an endless body into
 * memory, and every redirect comes back to the scanner to be checked.
 *
 * Node does the fetch, not the browser. That keeps the byte count and the
 * redirect decision in one place, and is where the resolved address would be
 * pinned to close DNS rebinding (WCA-61).
 */

/** Large enough for any real page; a document over this is refused. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export class DocumentTooLargeError extends Error {
  constructor(
    readonly url: string,
    readonly limitBytes: number,
  ) {
    super(`Refused to load ${url}: the document is larger than ${Math.round(limitBytes / 1024 / 1024)} MB.`);
    this.name = "DocumentTooLargeError";
  }
}

export class DocumentFetchError extends Error {
  constructor(url: string, reason: string) {
    super(`Could not load ${url}: ${reason}`);
    this.name = "DocumentFetchError";
  }
}

export type FetchedDocument = { status: number; headers: Record<string, string>; body: Buffer };

/** Headers that belong to one hop of the connection, or that the decoded body no longer matches. */
const DROPPED_REQUEST_HEADERS = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "expect", "content-length"]);
const DROPPED_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

export async function fetchDocument(
  request: { url: string; method: string; headers: Record<string, string>; body: Buffer | null },
  options: { timeoutMs: number; maxBytes?: number },
): Promise<FetchedDocument> {
  const maxBytes = options.maxBytes ?? MAX_DOCUMENT_BYTES;
  const headers = Object.fromEntries(
    Object.entries(request.headers).filter(([name]) => !name.startsWith(":") && !DROPPED_REQUEST_HEADERS.has(name.toLowerCase())),
  );

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers,
      ...(request.body && request.method !== "GET" && request.method !== "HEAD" ? { body: new Uint8Array(request.body) } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    // Node reports "fetch failed" and puts the useful part in `cause`.
    const cause = (error as { cause?: { message?: string } }).cause;
    throw new DocumentFetchError(request.url, cause?.message ?? (error as Error).message);
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new DocumentTooLargeError(request.url, maxBytes);
  }

  // Count bytes as they arrive (after decompression, so a gzip bomb counts too).
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body?.getReader();
  try {
    for (;;) {
      const next = await reader?.read();
      if (!next || next.done) break;
      received += next.value.byteLength;
      if (received > maxBytes) {
        await reader?.cancel();
        throw new DocumentTooLargeError(request.url, maxBytes);
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof DocumentTooLargeError) throw error;
    throw new DocumentFetchError(request.url, (error as Error).message);
  }

  const out: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name) && name !== "set-cookie") out[name] = value;
  });
  // Playwright splits a multi-value set-cookie on newlines.
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) out["set-cookie"] = cookies.join("\n");

  return { status: response.status, headers: out, body: Buffer.concat(chunks) };
}
