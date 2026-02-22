import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditModal } from '../EditModal';

// Mock lucide-react to avoid issues with SVG rendering in JSDOM
jest.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x" />,
  Save: () => <div data-testid="icon-save" />,
  Loader2: ({ className }: { className?: string }) => <div data-testid="icon-loader" className={className} />,
  AlertTriangle: () => <div data-testid="icon-alert" />,
  Sparkles: () => <div data-testid="icon-sparkles" />,
  Upload: () => <div data-testid="icon-upload" />,
  Repeat: () => <div data-testid="icon-repeat" />,
  ExternalLink: () => <div data-testid="icon-external-link" />,
  Pencil: () => <div data-testid="icon-pencil" />,
}));

// Mock the side-effect imports to avoid loading complex plugin logic
jest.mock('@/lib/plugins/bundled/seopress/SEOTab', () => ({}));
jest.mock('@/lib/plugins/bundled/ai-fill/AIFillTab', () => ({}));

// Mock fetch for SEO data loading
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ seo: null }),
  })
) as jest.Mock;

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
    onCreate: jest.fn(),
    isCreating: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders save button with Save icon initially', () => {
    render(<EditModal {...defaultProps} />);

    // Simulate a change to enable the save button
    const titleInput = screen.getByDisplayValue('Test Resource');
    fireEvent.change(titleInput, { target: { value: 'Updated Resource' } });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).toBeInTheDocument();
    expect(screen.getByTestId('icon-save')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-loader')).not.toBeInTheDocument();
  });

  test('renders loading state when saving', async () => {
    // Make onSave take some time
    const onSave = jest.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<EditModal {...defaultProps} onSave={onSave} />);

    // Simulate a change to enable the save button
    const titleInput = screen.getByDisplayValue('Test Resource');
    fireEvent.change(titleInput, { target: { value: 'Updated Resource' } });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    // Check for loading state immediately after click
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-save')).not.toBeInTheDocument();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  test('close button has aria-label', () => {
    render(<EditModal {...defaultProps} />);

    const closeButton = screen.getByLabelText('Close modal');
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toContainElement(screen.getByTestId('icon-x'));
  });
});
