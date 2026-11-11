// HMAC-SHA256 over `${timestamp}.${body}`, hex encoded, sent as
//   X-LendLoop-Timestamp: <unix seconds>
//   X-LendLoop-Signature: sha256=<hex>
// The timestamp is part of the signed string so a captured request can't be
// replayed later. Each direction has its own secret.

const encoder = new TextEncoder();
export const MAX_SKEW_SECONDS = 300;

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sign(secret: string, timestamp: string, body: string) {
  const mac = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(`${timestamp}.${body}`));
  return `sha256=${toHex(mac)}`;
}

/** Constant-time compare so the check doesn't leak how many characters matched. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verify(
  secret: string | undefined,
  timestamp: string | null,
  signature: string | null,
  body: string,
): Promise<boolean> {
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) return false;
  return safeEqual(await sign(secret, timestamp, body), signature);
}
