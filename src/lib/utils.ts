import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Decode HTML entities from WordPress rendered content
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;

  // First handle numeric entities like &#038; &#123; etc.
  let result = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  // Then handle named entities
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '\u2013',
    '&mdash;': '\u2014',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&hellip;': '\u2026',
  };

  for (const [entity, char] of Object.entries(namedEntities)) {
    result = result.split(entity).join(char);
  }

  return result;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return formatDate(dateString);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Maps an array of items through an async function with a concurrency limit.
 * Useful for rate-limiting API requests (e.g. SEO data fetching).
 */
export async function pMap<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let hasError = false;

  async function worker() {
    while (currentIndex < items.length && !hasError) {
      const index = currentIndex++;
      try {
        results[index] = await mapper(items[index]);
      } catch (err) {
        hasError = true;
        throw err;
      }
    }
  }

  const workers = [];
  const numWorkers = Math.min(concurrency, items.length);
  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

export const STATUS_COLORS: Record<string, string> = {
  publish: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  pending: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  private: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

/**
 * Compare two semantic version strings
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  // Strip 'v' prefix and handle pre-release tags (simplified: treat as smaller than same version without tag)
  const clean = (v: string) => v.replace(/^v/, '');
  const [v1Main, v1Pre] = clean(v1).split('-');
  const [v2Main, v2Pre] = clean(v2).split('-');

  const p1 = v1Main.split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = v2Main.split('.').map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a !== b) return a > b ? 1 : -1;
  }

  // If main versions are equal, handle pre-release precedence
  if (v1Pre && !v2Pre) return -1;
  if (!v1Pre && v2Pre) return 1;
  if (v1Pre && v2Pre) {
    return v1Pre.localeCompare(v2Pre);
  }

  return 0;
}

/**
 * Check if a version satisfies a range requirement
 * Supports:
 * - Exact match: "1.2.3"
 * - Operators: ">=1.2.3", ">1.2.3", "<=1.2.3", "<1.2.3"
 * - Caret (compatible changes): "^1.2.3" (>=1.2.3 <2.0.0, or >=0.1.2 <0.2.0)
 * - Tilde (patch changes): "~1.2.3" (>=1.2.3 <1.3.0)
 */
export function satisfies(version: string, range: string): boolean {
  if (!range || range === '*') return true;

  const cleanRange = range.replace(/^\s+|\s+$/g, '');

  // Handle caret range ^1.2.3
  if (cleanRange.startsWith('^')) {
    const target = cleanRange.substring(1);
    const parts = target.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const major = parts[0];
    const minor = parts[1] || 0;

    let upperBoundary: string;
    if (major !== 0) {
      upperBoundary = `${major + 1}.0.0`;
    } else if (minor !== 0) {
      upperBoundary = `0.${minor + 1}.0`;
    } else {
      // For 0.0.x, only the exact version matches (or next patch if we followed npm exactly)
      // Here we follow npm: ^0.0.1 is >=0.0.1 <0.0.2
      const patch = parts[2] || 0;
      upperBoundary = `0.0.${patch + 1}`;
    }

    return (
      compareVersions(version, target) >= 0 &&
      compareVersions(version, upperBoundary) < 0
    );
  }

  // Handle tilde range ~1.2.3
  if (cleanRange.startsWith('~')) {
    const target = cleanRange.substring(1);
    const parts = target.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const major = parts[0];
    const minor = parts[1] || 0;
    return (
      compareVersions(version, target) >= 0 &&
      compareVersions(version, `${major}.${minor + 1}.0`) < 0
    );
  }

  // Handle operators
  const match = range.match(/^([>=<]+)\s*(.*)$/);
  if (match) {
    const op = match[1];
    const target = match[2];
    const cmp = compareVersions(version, target);

    switch (op) {
      case '>=':
        return cmp >= 0;
      case '>':
        return cmp > 0;
      case '<=':
        return cmp <= 0;
      case '<':
        return cmp < 0;
      case '=':
      case '==':
        return cmp === 0;
    }
  }

  // Fallback to exact match
  return compareVersions(version, range) === 0;
}
