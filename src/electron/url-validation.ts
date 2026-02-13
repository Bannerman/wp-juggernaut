/**
 * Validates if a URL is safe to be opened externally by the application.
 * Only http: and https: protocols are permitted to prevent local file access
 * or other protocol-based attacks.
 *
 * @param url The URL string to validate
 * @returns boolean indicating if the URL is valid and safe
 */
export function isValidExternalUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch (error) {
    // If URL parsing fails, it's not a valid URL
    return false;
  }
}
