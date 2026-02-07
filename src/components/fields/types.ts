import type { FieldDefinition } from '@/lib/plugins/types';

export interface FieldRendererProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  /** All terms by taxonomy slug, for taxonomy-sourced selects */
  terms?: Record<string, Array<{ id: number; name: string }>>;
  /** Nesting depth for repeaters (0 = top level) */
  depth?: number;
}
