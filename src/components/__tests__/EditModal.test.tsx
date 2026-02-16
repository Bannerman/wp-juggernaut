import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditModal } from '../EditModal';
import React from 'react';

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  X: ({ className }: { className?: string }) => <div data-testid="icon-x" className={className} />,
  Save: ({ className }: { className?: string }) => <div data-testid="icon-save" className={className} />,
  Loader2: ({ className }: { className?: string }) => <div data-testid="icon-loader" className={className} />,
  AlertTriangle: () => <div data-testid="icon-alert" />,
  Sparkles: () => <div data-testid="icon-sparkles" />,
  Upload: () => <div data-testid="icon-upload" />,
  Repeat: () => <div data-testid="icon-repeat" />,
  Search: () => <div data-testid="icon-search" />,
  Globe: () => <div data-testid="icon-globe" />,
  Share2: () => <div data-testid="icon-share" />,
}));

// Mock plugin side-effects
jest.mock('@/lib/plugins/bundled/seopress/SEOTab', () => ({}));
jest.mock('@/lib/plugins/bundled/ai-fill/AIFillTab', () => ({}));

// Mock fetch for SEO data
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ seo: null }),
  })
) as jest.Mock;

describe('EditModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();
  const defaultProps = {
    resource: {
        id: 1,
        title: 'Test Post',
        slug: 'test-post',
        status: 'publish',
        modified_gmt: '',
        is_dirty: false,
        taxonomies: {},
        meta_box: {},
    },
    terms: {},
    onClose: mockOnClose,
    onSave: mockOnSave,
    isCreating: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<EditModal {...defaultProps} />);
    expect(screen.getByText('Test Post')).toBeInTheDocument();
  });

  it('displays loading spinner when saving', async () => {
    // Render with modified resource to enable save button
    const props = {
      ...defaultProps,
      resource: { ...defaultProps.resource, title: 'Changed Title' }, // Just to ensure initial state matches if needed
    };

    render(<EditModal {...props} />);

    // Change title to enable save button
    const titleInput = screen.getByDisplayValue('Changed Title');
    fireEvent.change(titleInput, { target: { value: 'New Title' } });

    const saveButton = screen.getByText('Save Changes');
    expect(saveButton).toBeEnabled();

    // Mock onSave to return a promise that doesn't resolve immediately
    // or just check the state during the click handler execution if possible.
    // However, since state updates are async, we might need to rely on the component's internal state.
    // But since `isSaving` is internal state set during `handleSave`, we can't easily control it from outside unless `onSave` returns a promise and we await it.

    let resolveSave: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    mockOnSave.mockReturnValue(savePromise);

    fireEvent.click(saveButton);

    // Now it should be saving
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    // Check for spinner - this expectation should FAIL initially
    const loader = screen.queryByTestId('icon-loader');
    // We expect this to fail in the "before" state
    // But in the test file, we write what we want to be true eventually.
    // So:
    expect(loader).toBeInTheDocument();
    expect(loader).toHaveClass('animate-spin');

    // Resolve save to clean up
    resolveSave!();
  });

  it('has accessible close button', () => {
    render(<EditModal {...defaultProps} />);
    const closeButton = screen.getAllByRole('button')[0]; // First button is usually close in header
    // Or find by icon
    const closeIcon = screen.getByTestId('icon-x');
    const button = closeIcon.closest('button');

    // Check for aria-label - this expectation should FAIL initially
    expect(button).toHaveAttribute('aria-label', 'Close modal');
  });

  it('has accessible modal attributes', () => {
    const { container } = render(<EditModal {...defaultProps} />);
    // The outer div should have role="dialog"
    // Since it's a fixed inset-0 div, it's likely the second or third div in structure
    // We can look for the role directly
    const dialog = screen.getByRole('dialog');

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'edit-modal-title');

    const title = screen.getByText('Test Post');
    expect(title).toHaveAttribute('id', 'edit-modal-title');
  });
});
