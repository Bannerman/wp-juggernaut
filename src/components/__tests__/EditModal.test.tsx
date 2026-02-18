import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EditModal } from '../EditModal';
import React from 'react';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x" />,
  Save: () => <div data-testid="icon-save" />,
  Loader2: () => <div data-testid="icon-loader" />,
  AlertTriangle: () => <div data-testid="icon-alert" />,
  Sparkles: () => <div data-testid="icon-sparkles" />,
  Upload: () => <div data-testid="icon-upload" />,
  Repeat: () => <div data-testid="icon-repeat" />,
}));

// Mock plugin tabs to avoid side-effects
jest.mock('@/lib/plugins/bundled/seopress/SEOTab', () => ({}));
jest.mock('@/lib/plugins/bundled/ai-fill/AIFillTab', () => ({}));

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
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
    modified_gmt: '2023-01-01',
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

  it('renders correctly with accessibility attributes', async () => {
    render(<EditModal {...defaultProps} />);

    // Check modal role
    const modal = screen.getByRole('dialog');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-labelledby', 'edit-modal-title');

    // Check title ID
    const title = screen.getByText('Test Resource');
    expect(title).toHaveAttribute('id', 'edit-modal-title');

    // Check close button aria-label
    const closeButton = screen.getByLabelText('Close modal');
    expect(closeButton).toBeInTheDocument();
  });

  it('shows loading state when creating', () => {
    render(<EditModal {...defaultProps} resource={null} isCreating={true} />);

    // Loader should be present
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-save')).not.toBeInTheDocument();
    expect(screen.getByText('Creating...')).toBeInTheDocument();
  });
});
