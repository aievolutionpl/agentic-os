export function trustedSender(
  frameUrl: string | undefined,
  frameIsMain: boolean,
  expectedUrl: string,
): boolean {
  return frameIsMain && frameUrl === expectedUrl;
}

/** Only explicit user clicks may ask the OS to open a regular web URL. */
export function externalWebUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096)
    throw Error("INVALID_URL");
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error("INVALID_URL");
  return url.href;
}
