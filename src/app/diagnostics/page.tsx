'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Search, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditEntry {
  field_name: string;
  source: string;
  category: string;
  status: string;
  detail: string | null;
  affected_resources: number[];
}

interface AuditResult {
  audit_run_at: string;
  entries: AuditEntry[];
  summary: {
    ok: number;
    missing_in_wp: number;
    unmapped_local: number;
    total: number;
  };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  ok: { label: 'OK', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  missing_in_wp: { label: 'Missing in WP', color: 'text-red-700', bg: 'bg-red-100', icon: XCircle },
  unmapped_local: { label: 'Unmapped locally', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: AlertTriangle },
};

export default function DiagnosticsPage() {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchAudit() {
      try {
        const res = await fetch('/api/field-audit');
        if (!res.ok) throw new Error('Failed to fetch audit');
        const data = await res.json();
        setAudit(data.latest);
      } catch (err) {
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
    }
    fetchAudit();
  }, []);

  const filteredEntries = useMemo(() => {
    if (!audit) return [];
    return audit.entries.filter((entry) => {
      if (statusFilter && entry.status !== statusFilter) return false;
      if (searchQuery && !entry.field_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [audit, statusFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Field Diagnostics</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {!audit ? (
          /* Empty state */
          <div className="text-center py-16">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No audit data available</h3>
            <p className="text-gray-500 mb-4">
              Run a <strong>Full Sync</strong> from the dashboard to generate field diagnostics.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <>
            {/* Audit timestamp */}
            <p className="text-sm text-gray-500 mb-4">
              Last audit: {new Date(audit.audit_run_at).toLocaleString()}
            </p>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-800">OK</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{audit.summary.ok}</p>
                <p className="text-xs text-green-600">Fields matched on both sides</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-medium text-red-800">Missing in WP</span>
                </div>
                <p className="text-2xl font-bold text-red-900">{audit.summary.missing_in_wp}</p>
                <p className="text-xs text-red-600">Local mappings with no WP field</p>
              </div>
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-800">Unmapped locally</span>
                </div>
                <p className="text-2xl font-bold text-yellow-900">{audit.summary.unmapped_local}</p>
                <p className="text-xs text-yellow-600">WP fields not referenced locally</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search field names..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">All Statuses</option>
                <option value="ok">OK</option>
                <option value="missing_in_wp">Missing in WP</option>
                <option value="unmapped_local">Unmapped locally</option>
              </select>
            </div>

            {/* Results table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Field Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No fields match your filters
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry) => {
                      const config = STATUS_CONFIG[entry.status] || STATUS_CONFIG.ok;
                      const Icon = config.icon;
                      return (
                        <tr key={entry.field_name} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                              {entry.field_name}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{entry.source}</td>
                          <td className="px-4 py-3 text-gray-600">{entry.category}</td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', config.bg, config.color)}>
                              <Icon className="w-3 h-3" />
                              {config.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                            {entry.detail}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Showing {filteredEntries.length} of {audit.entries.length} fields
            </p>
          </>
        )}
      </main>
    </div>
  );
}
