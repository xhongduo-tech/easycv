const CURSOR_VERSION = 1;

export interface ResumeCursor {
  updatedAt: string;
  id: string;
  filterHash: string;
}

export async function createResumeFilterHash(input: {
  track?: string;
  status?: string;
  q?: string;
}) {
  const normalized = JSON.stringify({
    track: input.track ?? "",
    status: input.status ?? "",
    q: input.q?.trim().toLocaleLowerCase("zh-CN") ?? "",
  });
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return encodeBase64Url(new Uint8Array(bytes)).slice(0, 22);
}

export function encodeResumeCursor(cursor: ResumeCursor) {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    v: CURSOR_VERSION,
    updatedAt: cursor.updatedAt,
    id: cursor.id,
    filterHash: cursor.filterHash,
  })));
}

export function decodeResumeCursor(value: string, expectedFilterHash: string): ResumeCursor | null {
  if (!value || value.length > 1_000 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as Record<string, unknown>;
    if (
      payload.v !== CURSOR_VERSION
      || typeof payload.updatedAt !== "string"
      || !Number.isFinite(new Date(payload.updatedAt).getTime())
      || typeof payload.id !== "string"
      || payload.id.length > 100
      || payload.filterHash !== expectedFilterHash
    ) return null;
    return {
      updatedAt: payload.updatedAt,
      id: payload.id,
      filterHash: expectedFilterHash,
    };
  } catch {
    return null;
  }
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = `${value.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
