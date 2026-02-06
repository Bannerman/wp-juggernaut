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
 * Get taxonomy labels from profile or provide fallback
 * This is kept as a constant for backward compatibility in client components
 * The actual labels come from the profile via API
 */
export const TAXONOMY_LABELS: Record<string, string> = {
  // These are fallbacks - actual labels come from profile
  'resource-type': 'Resource Type',
  topic: 'Topic',
  intent: 'Intent',
  audience: 'Audience',
  leagues: 'League',
  competition_format: 'Competition Format',
  'bracket-size': 'Bracket Size',
  file_format: 'File Format',
  // Common WordPress defaults
  category: 'Category',
  post_tag: 'Tag',
};

/**
 * Get a taxonomy label with fallback to slug
 */
export function getTaxonomyLabel(
  slug: string,
  labels?: Record<string, string>
): string {
  if (labels && labels[slug]) {
    return labels[slug];
  }
  if (TAXONOMY_LABELS[slug]) {
    return TAXONOMY_LABELS[slug];
  }
  // Convert slug to title case as fallback
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export const STATUS_COLORS: Record<string, string> = {
  publish: 'bg-green-100 text-green-800',
  draft: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-orange-100 text-orange-800',
  private: 'bg-purple-100 text-purple-800',
};
