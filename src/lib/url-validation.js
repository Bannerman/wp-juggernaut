"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidExternalUrl = isValidExternalUrl;
/**
 * Validates if a URL is safe to be opened externally by the application.
 * Only http: and https: protocols are permitted to prevent local file access
 * or other protocol-based attacks.
 *
 * @param url The URL string to validate
 * @returns boolean indicating if the URL is valid and safe
 */
function isValidExternalUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    }
    catch (error) {
        // If URL parsing fails, it's not a valid URL
        return false;
    }
}
//# sourceMappingURL=url-validation.js.map