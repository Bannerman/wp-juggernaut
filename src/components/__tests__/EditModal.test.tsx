import { render, screen } from '@testing-library/react';
import { EditModal } from '../EditModal';
import React from 'react';

// Mocks
jest.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x">X</div>,
  Save: () => <div data-testid="icon-save">Save</div>,
  Loader2: () => <div data-testid="icon-loader">Loader</div>,
  AlertTriangle: () => <div data-testid="icon-alert">Alert</div>,
  Sparkles: () => <div data-testid="icon-sparkles">Sparkles</div>,
  Upload: () => <div data-testid="icon-upload">Upload</div>,
  Repeat: () => <div data-testid="icon-repeat">Repeat</div>,
  ExternalLink: () => <div data-testid="icon-external-link">ExternalLink</div>,
  Pencil: () => <div data-testid="icon-pencil">Pencil</div>,
}));

jest.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

jest.mock('@/lib/imageProcessing', () => ({
  ImageProcessingPipeline: jest.fn(),
  createValidationProcessor: jest.fn(),
  seoDataProcessor: jest.fn(),
  shortpixelProcessor: jest.fn(),
  createFilenameProcessor: jest.fn(),
}));

jest.mock('@/components/fields', () => ({
  DynamicTab: () => <div data-testid="dynamic-tab">DynamicTab</div>,
  getPluginTab: () => () => <div data-testid="plugin-tab">PluginTab</div>,
}));

jest.mock('@/lib/plugins/bundled/seopress/SEOTab', () => ({}));
jest.mock('@/lib/plugins/bundled/ai-fill/AIFillTab', () => ({}));

// Mock global fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ seo: {} }),
  })
) as jest.Mock;

describe('EditModal', () => {
  const defaultProps = {
    resource: {
      id: 1,
      title: 'Test Resource',
      slug: 'test-resource',
      status: 'publish',
      modified_gmt: '2023-01-01',
      is_dirty: false,
      taxonomies: {},
      meta_box: {},
    },
    terms: {},
    onClose: jest.fn(),
    onSave: jest.fn(),
    taxonomyConfig: [],
  };

  it('renders close button with accessibility label', () => {
    render(<EditModal {...defaultProps} />);

    // This is expected to fail initially as the button has no aria-label "Close"
    // It only has the X icon.
    // We use getAllByRole because there might be other buttons, but we want one with name "Close"
    const closeButton = screen.getByRole('button', { name: /close/i });
    expect(closeButton).toBeInTheDocument();
  });

  it('shows loading spinner when creating/saving', () => {
      // We simulate "creating" state via prop which triggers the loading text logic
      render(<EditModal {...defaultProps} resource={null} isCreating={true} />);

      // Currently this renders Save icon, but we want Loader
      // This expectation will fail initially
      expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
      expect(screen.queryByTestId('icon-save')).not.toBeInTheDocument();
  });
});
