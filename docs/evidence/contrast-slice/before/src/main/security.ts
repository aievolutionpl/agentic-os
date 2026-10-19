export function trustedSender(
  frameUrl: string | undefined,
  frameIsMain: boolean,
  expectedUrl: string,
): boolean {
  return frameIsMain && frameUrl === expectedUrl;
}
