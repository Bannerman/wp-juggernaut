import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import he from 'he';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Decode HTML entities from WordPress rendered content
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  return he.decode(text);
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
  publish: 'bg-green-100 text-green-800',
  draft: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-orange-100 text-orange-800',
  private: 'bg-purple-100 text-purple-800',
};
