import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '../FilterPanel';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronDown: () => <div data-testid="chevron-down" />,
  X: () => <div data-testid="x-icon" />,
}));

// Mock utils
jest.mock('@/lib/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

const mockTerms = {
  category: [
    { id: 1, taxonomy: 'category', name: 'Tech', slug: 'tech', parent_id: 0 },
    { id: 2, taxonomy: 'category', name: 'News', slug: 'news', parent_id: 0 },
  ],
  tags: [
    { id: 3, taxonomy: 'tags', name: 'React', slug: 'react', parent_id: 0 },
  ],
};

const mockFilters = {
  category: [1], // 'Tech' is selected
  tags: [],
};

const mockOnChange = jest.fn();

const taxonomyConfig = [
  { slug: 'category', name: 'Categories', rest_base: 'categories', show_in_filter: true, filter_position: 1 },
  { slug: 'tags', name: 'Tags', rest_base: 'tags', show_in_filter: true, filter_position: 2 },
];

describe('FilterPanel', () => {
  it('renders filter sections correctly', () => {
    render(
      <FilterPanel
        terms={mockTerms}
        filters={mockFilters}
        onChange={mockOnChange}
        taxonomyConfig={taxonomyConfig}
      />
    );

    expect(screen.getByText('Categories')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('has accessible toggle buttons', () => {
    render(
      <FilterPanel
        terms={mockTerms}
        filters={mockFilters}
        onChange={mockOnChange}
        taxonomyConfig={taxonomyConfig}
      />
    );

    // Find the button that toggles the "Categories" section
    // The button contains the text "Categories"
    const toggleButton = screen.getByText('Categories').closest('button');
    expect(toggleButton).toBeInTheDocument();

    // Accessibility checks
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(toggleButton!);

    // Should now be expanded
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    const controlsId = toggleButton?.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    // The content panel should exist and have the matching ID
    // We can find something inside the panel to verify it's open
    const techCheckbox = screen.getByLabelText('Tech');
    const panel = techCheckbox.closest('div.border-t'); // The expanded content container has border-t
    expect(panel).toHaveAttribute('id', controlsId);
  });

  it('has accessible clear buttons', () => {
    render(
      <FilterPanel
        terms={mockTerms}
        filters={mockFilters}
        onChange={mockOnChange}
        taxonomyConfig={taxonomyConfig}
      />
    );

    // Expand category to see the internal clear button
    const toggleButton = screen.getByText('Categories').closest('button');
    fireEvent.click(toggleButton!);

    // "Clear all" button (global)
    const clearAllButton = screen.getByText('Clear all');
    expect(clearAllButton).toHaveAttribute('aria-label', 'Clear all filters');

    // "Clear" button (taxonomy specific - inside expanded panel)
    // Note: The text is "Clear" and it appears next to selected terms
    const clearTaxonomyButton = screen.getByText('Clear', { selector: 'button' });
    expect(clearTaxonomyButton).toHaveAttribute('aria-label', 'Clear filters for Categories');
  });

  it('has accessible remove term buttons', () => {
    render(
      <FilterPanel
        terms={mockTerms}
        filters={mockFilters}
        onChange={mockOnChange}
        taxonomyConfig={taxonomyConfig}
      />
    );

    // Expand category
    const toggleButton = screen.getByText('Categories').closest('button');
    fireEvent.click(toggleButton!);

    // Find the remove button for the selected term "Tech"
    // It's the button inside the span that contains "Tech"
    const removeButton = screen.getByTestId('x-icon').closest('button');
    expect(removeButton).toBeInTheDocument();
    expect(removeButton).toHaveAttribute('aria-label', 'Remove filter Tech');
  });
});
