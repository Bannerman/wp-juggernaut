import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditModal } from '../EditModal';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('lucide-react', () => ({
  X: () => <svg data-testid="icon-x" />,
  Save: () => <svg data-testid="icon-save" />,
  AlertTriangle: () => <svg data-testid="icon-alert" />,
  Sparkles: () => <svg data-testid="icon-sparkles" />,
  Upload: () => <svg data-testid="icon-upload" />,
  Loader2: () => <svg data-testid="icon-loader" />,
  Repeat: () => <svg data-testid="icon-repeat" />,
}));

jest.mock('@/lib/utils', () => ({
  cn: (...inputs: any[]) => inputs.join(' '),
}));

jest.mock('@/lib/imageProcessing', () => ({
  createFilenameProcessor: jest.fn(),
  seoDataProcessor: jest.fn(),
  shortpixelProcessor: jest.fn(),
  createValidationProcessor: jest.fn(),
  ImageProcessingPipeline: jest.fn(),
}));

jest.mock('@/components/fields', () => ({
  DynamicTab: () => <div data-testid="dynamic-tab" />,
  getPluginTab: jest.fn(),
}));

// Mock side-effect imports
jest.mock('@/lib/plugins/bundled/seopress/SEOTab', () => ({}));
jest.mock('@/lib/plugins/bundled/ai-fill/AIFillTab', () => ({}));

// Mock global fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ seo: null }),
  })
) as jest.Mock;

describe('EditModal Accessibility', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();
  const mockResource = {
    id: 1,
    title: 'Test Resource',
    slug: 'test-resource',
    status: 'publish',
    modified_gmt: '2023-01-01T00:00:00',
    is_dirty: false,
    taxonomies: {
      category: [1, 2],
    },
    meta_box: {},
  };

  const mockTerms = {
    category: [
      { id: 1, taxonomy: 'category', name: 'Cat 1', slug: 'cat-1', parent_id: 0 },
      { id: 2, taxonomy: 'category', name: 'Cat 2', slug: 'cat-2', parent_id: 0 },
      { id: 3, taxonomy: 'category', name: 'Cat 3', slug: 'cat-3', parent_id: 0 },
    ],
  };

  const mockTaxonomyConfig = [
    { slug: 'category', name: 'Category', rest_base: 'categories', hierarchical: false, show_in_filter: true },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with correct accessibility attributes', () => {
    const { container } = render(
      <EditModal
        resource={mockResource}
        terms={mockTerms}
        onClose={mockOnClose}
        onSave={mockOnSave}
        enabledTabs={['basic', 'classification']}
        taxonomyConfig={mockTaxonomyConfig}
      />
    );

    // Verify modal role
    const modal = screen.getByRole('dialog');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-labelledby', 'modal-title');

    // Verify close button label
    const closeButton = screen.getByRole('button', { name: /close modal/i });
    expect(closeButton).toBeInTheDocument();

    // Verify title input association
    const titleInput = screen.getByLabelText('Title');
    expect(titleInput).toHaveAttribute('id', 'resource-title');
    expect(titleInput).toHaveValue('Test Resource');
  });

  it('closes when Escape key is pressed', () => {
    render(
      <EditModal
        resource={mockResource}
        terms={mockTerms}
        onClose={mockOnClose}
        onSave={mockOnSave}
        enabledTabs={['basic', 'classification']}
        taxonomyConfig={mockTaxonomyConfig}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('renders taxonomy terms with aria-pressed state', () => {
    render(
      <EditModal
        resource={mockResource}
        terms={mockTerms}
        onClose={mockOnClose}
        onSave={mockOnSave}
        enabledTabs={['basic', 'classification']}
        taxonomyConfig={mockTaxonomyConfig}
      />
    );

    // Switch to classification tab
    const classTab = screen.getByText('Classification');
    fireEvent.click(classTab);

    const term1Button = screen.getByText('Cat 1');
    const term3Button = screen.getByText('Cat 3');

    expect(term1Button).toHaveAttribute('aria-pressed', 'true');
    expect(term3Button).toHaveAttribute('aria-pressed', 'false');
  });
});
