'use client';

import type { FieldRendererProps } from './types';
import { TextRenderer } from './TextRenderer';
import { TextareaRenderer } from './TextareaRenderer';
import { NumberRenderer } from './NumberRenderer';
import { CheckboxRenderer } from './CheckboxRenderer';
import { DateRenderer } from './DateRenderer';
import { DateTimeRenderer } from './DateTimeRenderer';
import { ColorRenderer } from './ColorRenderer';
import { SelectRenderer } from './SelectRenderer';
import { UrlRenderer } from './UrlRenderer';
import { RepeaterRenderer } from './RepeaterRenderer';
import { TextareaListRenderer } from './TextareaListRenderer';

/** Built-in field type renderers (always available) */
const builtinRenderers: Record<string, React.ComponentType<FieldRendererProps>> = {
  text: TextRenderer,
  textarea: TextareaRenderer,
  number: NumberRenderer,
  checkbox: CheckboxRenderer,
  date: DateRenderer,
  datetime: DateTimeRenderer,
  color: ColorRenderer,
  select: SelectRenderer,
  url: UrlRenderer,
  repeater: RepeaterRenderer,
  'textarea-list': TextareaListRenderer,
};

/**
 * Plugin-registered field type renderers.
 * Plugins call `registerFieldRenderer(type, Component)` to add custom field types.
 * Plugin renderers take precedence over builtins for the same type key.
 */
const pluginRenderers: Record<string, React.ComponentType<FieldRendererProps>> = {};

/**
 * Register a custom field renderer for a field type.
 * Call this from a plugin's `initialize()` to make a new field type available
 * in DynamicTab / field_layout rendering.
 *
 * @example
 * ```ts
 * import { registerFieldRenderer } from '@/components/fields';
 * registerFieldRenderer('rating', RatingFieldComponent);
 * ```
 */
export function registerFieldRenderer(
  fieldType: string,
  component: React.ComponentType<FieldRendererProps>
): void {
  pluginRenderers[fieldType] = component;
}

/**
 * Unregister a plugin-provided field renderer.
 * Call this from a plugin's `deactivate()` to clean up.
 */
export function unregisterFieldRenderer(fieldType: string): void {
  delete pluginRenderers[fieldType];
}

/**
 * Get all available renderers (builtin + plugin).
 * Plugin renderers override builtins for the same field type key.
 */
export function getRenderers(): Record<string, React.ComponentType<FieldRendererProps>> {
  return { ...builtinRenderers, ...pluginRenderers };
}

interface FieldRendererComponentProps extends FieldRendererProps {
  /** Optional extra renderers passed at call-site (overrides both builtin and plugin) */
  extraRenderers?: Record<string, React.ComponentType<FieldRendererProps>>;
}

export function FieldRenderer({ extraRenderers, ...props }: FieldRendererComponentProps) {
  // Lookup order: call-site extras → plugin-registered → builtins
  const Renderer =
    extraRenderers?.[props.field.type] ??
    pluginRenderers[props.field.type] ??
    builtinRenderers[props.field.type];

  if (!Renderer) {
    return (
      <p className="text-sm text-red-500">
        Unknown field type: <code>{props.field.type}</code>
      </p>
    );
  }

  // resourceTitle is passed through via ...props spread to all renderers
  return <Renderer {...props} />;
}
