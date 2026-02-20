import { render, screen, fireEvent, act } from '@testing-library/react';
import { EditModal } from '../EditModal';

// Mock dependencies
jest.mock('lucide-react', () => ({
  X: (props: any) => <div data-testid="icon-x" {...props} />,
  Save: (props: any) => <div data-testid="icon-save" {...props} />,
  Loader2: (props: any) => <div data-testid="icon-loader" {...props} />,
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
  ImageProcessingPipeline: jest.fn().mockImplementation(() => ({
    addProcessor: jest.fn().mockReturnThis(),
    process: jest.fn(),
  })),
}));

jest.mock('@/components/fields', () => ({
  DynamicTab: () => <div data-testid="dynamic-tab" />,
  getPluginTab: jest.fn(),
}));

jest.mock('@/lib/plugins/bundled/seopress/SEOTab', () => ({}));
jest.mock('@/lib/plugins/bundled/ai-fill/AIFillTab', () => ({}));

describe('EditModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();
  const defaultProps = {
    resource: {
      id: 1,
      title: 'Test Resource',
      slug: 'test-resource',
      status: 'publish',
      modified_gmt: '2024-01-01T00:00:00',
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
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({}),
        ok: true,
      })
    ) as jest.Mock;
  });

  it('renders correctly', async () => {
    await act(async () => {
      render(<EditModal {...defaultProps} />);
    });
    expect(screen.getByDisplayValue('Test Resource')).toBeInTheDocument();
  });

  it('has a close button with aria-label', async () => {
    await act(async () => {
      render(<EditModal {...defaultProps} />);
    });
    const closeButton = screen.getByRole('button', { name: /close modal/i });
    expect(closeButton).toBeInTheDocument();
    expect(screen.getByTestId('icon-x')).toBeInTheDocument();
  });

  it('shows loading spinner when saving', async () => {
    let resolveSave: (value: unknown) => void;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });

    const props = { ...defaultProps, onSave: jest.fn().mockReturnValue(savePromise) };

    await act(async () => {
      render(<EditModal {...props} />);
    });

    // Simulate a change to enable the save button
    const titleInput = screen.getByDisplayValue('Test Resource');
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Updated Resource' } });
    });

    const saveButton = screen.getByText('Save Changes').closest('button');
    expect(saveButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(saveButton!);
    });

    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-save')).not.toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(saveButton).toBeDisabled(); // Should be disabled while saving

    // Clean up
    await act(async () => {
      resolveSave!(undefined);
    });
  });
});
