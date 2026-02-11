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

const renderers: Record<string, React.ComponentType<FieldRendererProps>> = {
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

export function FieldRenderer(props: FieldRendererProps) {
  const Renderer = renderers[props.field.type];

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
