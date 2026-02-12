import { render, screen } from '@testing-library/react';
import { ResourceTable, Resource, Term } from '../ResourceTable';

// Mock Lucide icons to avoid potential issues, though they are simple SVGs
jest.mock('lucide-react', () => ({
  Edit2: () => <span data-testid="edit-icon" />,
  ExternalLink: () => <span data-testid="external-link-icon" />,
  ChevronUp: () => <span data-testid="chevron-up" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  Inbox: () => <span data-testid="inbox-icon" />,
}));

describe('ResourceTable Accessibility', () => {
  const mockTerms: Record<string, Term[]> = {
    category: [
      { id: 1, taxonomy: 'category', name: 'Tech', slug: 'tech', parent_id: 0 },
    ],
  };

  const mockResources: Resource[] = [
    {
      id: 101,
      title: 'Test Resource 1',
      slug: 'test-resource-1',
      status: 'publish',
      date_gmt: '2023-01-01T00:00:00',
      modified_gmt: '2023-01-02T00:00:00',
      is_dirty: false,
      taxonomies: { category: [1] },
      meta_box: {},
    },
    {
      id: 102,
      title: 'Test Resource 2',
      slug: 'test-resource-2',
      status: 'draft',
      date_gmt: '2023-01-03T00:00:00',
      modified_gmt: '2023-01-04T00:00:00',
      is_dirty: true,
      taxonomies: {},
      meta_box: {},
    },
  ];

  const defaultProps = {
    resources: mockResources,
    terms: mockTerms,
    selectedIds: [],
    onSelect: jest.fn(),
    onEdit: jest.fn(),
    onUpdate: jest.fn(),
  };

  test('renders checkboxes with accessible labels', () => {
    render(<ResourceTable {...defaultProps} />);

    // Check "Select all" checkbox
    // This should fail initially as aria-label is missing
    const selectAllCheckbox = screen.getByRole('checkbox', { name: /select all resources/i });
    expect(selectAllCheckbox).toBeInTheDocument();

    // Check individual row checkboxes
    // This should fail initially as aria-label is missing
    const rowCheckbox1 = screen.getByRole('checkbox', { name: /select test resource 1/i });
    expect(rowCheckbox1).toBeInTheDocument();

    const rowCheckbox2 = screen.getByRole('checkbox', { name: /select test resource 2/i });
    expect(rowCheckbox2).toBeInTheDocument();
  });
});
