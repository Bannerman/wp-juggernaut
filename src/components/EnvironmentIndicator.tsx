'use client';

import type { EnvironmentType } from '@/lib/site-config';

interface EnvironmentIndicatorProps {
  workspaceName: string;
  environment: EnvironmentType;
}

const ENV_CONFIG: Record<EnvironmentType, { label: string; className: string }> = {
  production: {
    label: 'Production',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  staging: {
    label: 'Staging',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  },
  development: {
    label: 'Development',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  },
};

const DOT_COLOR: Record<EnvironmentType, string> = {
  production: 'bg-red-500',
  staging: 'bg-yellow-500',
  development: 'bg-green-500',
};

export function EnvironmentIndicator({ workspaceName, environment }: EnvironmentIndicatorProps): React.ReactElement {
  const config = ENV_CONFIG[environment];

  return (
    <div className="flex items-center gap-2">
      {workspaceName && (
        <span className="text-xs text-gray-500 dark:text-gray-400">{workspaceName}</span>
      )}
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${DOT_COLOR[environment]}`} />
        {config.label}
      </span>
    </div>
  );
}
