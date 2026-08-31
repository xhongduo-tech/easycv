export async function hasValidMaintenanceCredential(request: Request, configuredSecret: string | undefined) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const configured = configuredSecret ?? "";
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  const [leftDigest, rightDigest] = await Promise.all([supplied, configured].map((value) => (
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  )));
  const left = new Uint8Array(leftDigest);
  const right = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
