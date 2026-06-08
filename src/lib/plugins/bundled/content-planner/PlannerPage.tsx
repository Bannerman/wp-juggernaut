'use client';

import React from 'react';
import { registerGlobalPage } from '@/components/globalPages';
import type { PageComponentProps } from '../../types';

/**
 * Content Planner page (Phase A stub).
 *
 * Phase B will replace this body with the Ideas board kanban + Keywords table.
 * For now it confirms the global-page plumbing works end to end.
 *
 * Registered at module load via `registerGlobalPage()` (side-effect import
 * pattern, mirrors how SEOTab/AIFillTab register themselves).
 */
export function PlannerPage(_props: PageComponentProps) {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Content Planner
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Plan ideas and keywords before they become posts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <h2 className="text-base font-medium text-gray-900 dark:text-gray-100">
              Ideas board
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Kanban with Idea / Researching / Drafting / Ready / Published columns.
              Coming next.
            </p>
          </div>

          <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <h2 className="text-base font-medium text-gray-900 dark:text-gray-100">
              Keywords
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Term, manual volume, target post link, gap surfacing. Coming next.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlannerPage;

registerGlobalPage({
  id: 'planner',
  label: 'Planner',
  icon: 'ClipboardList',
  position: 50,
  component: PlannerPage,
});
