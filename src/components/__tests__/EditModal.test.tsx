import React from 'react';
import { render, screen } from '@testing-library/react';
import { EditModal } from '../EditModal';

// Mocks
jest.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x" />,
  Save: () => <div data-testid="icon-save" />,
  Loader2: () => <div data-testid="icon-loader" />,
  AlertTriangle: () => <div />,
  Sparkles: () => <div />,
  Upload: () => <div />,
  Repeat: () => <div />,
  ExternalLink: () => <div />,
  Pencil: () => <div />,
}));

jest.mock('@/lib/imageProcessing', () => ({
  createFilenameProcessor: jest.fn(),
  seoDataProcessor: jest.fn(),
  shortpixelProcessor: jest.fn(),
  createValidationProcessor: jest.fn(),
  ImageProcessingPipeline: jest.fn(),
}));

jest.mock('@/components/fields', () => ({
  DynamicTab: () => <div>DynamicTab</div>,
  getPluginTab: jest.fn(),
}));

// Mock the side-effect imports
jest.mock('@/lib/plugins/bundled/seopress/SEOTab', () => ({}));
jest.mock('@/lib/plugins/bundled/ai-fill/AIFillTab', () => ({}));

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ seo: null }),
  })
) as jest.Mock;

describe('EditModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();
  const mockOnCreate = jest.fn();

  const defaultResource = {
    id: 1,
    title: 'Test Resource',
    slug: 'test-resource',
    status: 'publish',
    modified_gmt: '2023-01-01T00:00:00',
    is_dirty: false,
    taxonomies: {},
    meta_box: {},
  };

  const defaultProps = {
    resource: defaultResource,
    terms: {},
    onClose: mockOnClose,
    onSave: mockOnSave,
    onCreate: mockOnCreate,
    isCreating: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with resource title', () => {
    render(<EditModal {...defaultProps} />);
    expect(screen.getByDisplayValue('Test Resource')).toBeInTheDocument();
  });

  it('close button has accessible label', () => {
    render(<EditModal {...defaultProps} />);
    // The close button is the one with the X icon in the header
    const closeButtons = screen.getAllByTestId('icon-x');
    // Assuming the first one is the header close button
    const headerCloseButton = closeButtons[0].closest('button');
    expect(headerCloseButton).toHaveAttribute('aria-label', 'Close modal');
  });

  it('shows loading spinner instead of save icon when isCreating is true', () => {
    // We pass resource=null for create mode
    render(
      <EditModal
        {...defaultProps}
        resource={null}
        isCreating={true}
      />
    );

    // Should show "Creating..." text
    expect(screen.getByText('Creating...')).toBeInTheDocument();

    // Should show loader icon
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();

    // Should NOT show save icon
    expect(screen.queryByTestId('icon-save')).not.toBeInTheDocument();
  });
});
