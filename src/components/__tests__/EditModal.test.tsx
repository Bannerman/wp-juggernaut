import { render, screen, fireEvent } from '@testing-library/react';
import { EditModal } from '../EditModal';

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x" />,
  Save: () => <div data-testid="icon-save" />,
  Loader2: () => <div data-testid="icon-loader" />,
  Sparkles: () => <div data-testid="icon-sparkles" />,
  AlertTriangle: () => <div data-testid="icon-alert" />,
  Upload: () => <div data-testid="icon-upload" />,
  Repeat: () => <div data-testid="icon-repeat" />,
  ExternalLink: () => <div data-testid="icon-external" />,
  Pencil: () => <div data-testid="icon-pencil" />,
  RotateCcw: () => <div data-testid="icon-rotate" />,
  ChevronDown: () => <div data-testid="icon-chevron-down" />,
}));

// Mock the side-effect imports
jest.mock('@/lib/plugins/bundled/seopress/SEOTab', () => ({}));
jest.mock('@/lib/plugins/bundled/ai-fill/AIFillTab', () => ({}));

// Mock DynamicTab and getPluginTab
jest.mock('@/components/fields', () => ({
  DynamicTab: () => <div data-testid="dynamic-tab" />,
  getPluginTab: (id) => {
    if (id === 'seo') {
      const SeoTab = () => <div data-testid="seo-tab" />;
      SeoTab.displayName = 'SeoTab';
      return SeoTab;
    }
    if (id === 'ai') {
      const AiTab = () => <div data-testid="ai-tab" />;
      AiTab.displayName = 'AiTab';
      return AiTab;
    }
    return null;
  },
  // Mock DirtyFieldIndicator since it's used in EditModal
  DirtyFieldIndicator: () => <div data-testid="dirty-field-indicator" />,
}));

// Mock image processing
jest.mock('@/lib/imageProcessing', () => ({
  createFilenameProcessor: jest.fn(),
  seoDataProcessor: jest.fn(),
  shortpixelProcessor: jest.fn(),
  createValidationProcessor: jest.fn(),
  ImageProcessingPipeline: class {
    addProcessor() { return this; }
    process() { return Promise.resolve({}); }
  },
}));

// Mock DirtyFieldIndicator explicitly if the export from fields is not working as expected
jest.mock('../fields/DirtyFieldIndicator', () => ({
  DirtyFieldIndicator: () => <div data-testid="dirty-field-indicator" />,
}));

describe('EditModal', () => {
  const mockResource = {
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
    resource: mockResource,
    terms: {},
    onClose: jest.fn(),
    onSave: jest.fn(),
    enabledTabs: ['basic', 'classification'],
  };

  beforeEach(() => {
    // Mock global fetch for SEO data
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ seo: null }),
        ok: true,
      })
    ) as jest.Mock;

    // Clear mocks
    jest.clearAllMocks();
  });

  it('renders with correct title', () => {
    render(<EditModal {...defaultProps} />);
    expect(screen.getByText('Test Resource')).toBeInTheDocument();
  });

  it('has accessible close button', () => {
    render(<EditModal {...defaultProps} />);
    // This is expected to fail initially or succeed if I implemented it already.
    // Based on code reading, it should fail.
    const closeButton = screen.getByRole('button', { name: /close modal/i });
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows loading spinner when saving', async () => {
    let resolveSave: (value?: unknown) => void = () => {};
    const onSave = jest.fn(() => new Promise((resolve) => { resolveSave = resolve; }));

    render(<EditModal {...defaultProps} onSave={onSave} resource={{...mockResource, title: 'Old'}} />);

    // Make a change to enable save button
    const titleInput = screen.getByDisplayValue('Old');
    fireEvent.change(titleInput, { target: { value: 'New' } });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    // Now it should be saving
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-save')).not.toBeInTheDocument();

    // Resolve to finish
    resolveSave();
  });
});
