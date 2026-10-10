/** Only local paths, so a crafted link can't send people elsewhere after signing in. Mirrors AuthEndpoints.SafeReturnUrl. */
export function safeReturnUrl(url: string | null | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') ? url : '/';
}
