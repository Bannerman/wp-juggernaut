import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '../FilterPanel';

const mockTerms = {
  category: [
    { id: 1, taxonomy: 'category', name: 'Tech', slug: 'tech', parent_id: 0 },
    { id: 2, taxonomy: 'category', name: 'Design', slug: 'design', parent_id: 0 },
  ],
};

const mockConfig = [
  { slug: 'category', name: 'Categories', rest_base: 'categories', show_in_filter: true, filter_position: 1 },
];

describe('FilterPanel', () => {
  it('renders filter sections', () => {
    render(
      <FilterPanel
        terms={mockTerms}
        filters={{}}
        onChange={() => {}}
        taxonomyConfig={mockConfig}
      />
    );
    expect(screen.getByText('Filter by Taxonomy')).toBeInTheDocument();
    expect(screen.getByText('Categories')).toBeInTheDocument();
  });

  it('has accessible toggle buttons for taxonomies', () => {
    render(
      <FilterPanel
        terms={mockTerms}
        filters={{}}
        onChange={() => {}}
        taxonomyConfig={mockConfig}
      />
    );

    const toggleButton = screen.getByRole('button', { name: /Categories/i });
    // Expect aria-expanded to be present (false initially)
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('has accessible remove buttons for selected terms', () => {
    render(
      <FilterPanel
        terms={mockTerms}
        filters={{ category: [1] }} // Tech is selected
        onChange={() => {}}
        taxonomyConfig={mockConfig}
      />
    );

    // Open the accordion to see selected terms
    fireEvent.click(screen.getByRole('button', { name: /Categories/i }));

    // Should find a button with aria-label "Remove Tech"
    const removeButton = screen.getByRole('button', { name: /Remove Tech/i });
    expect(removeButton).toBeInTheDocument();
  });

  it('has accessible clear buttons for taxonomies', () => {
    render(
      <FilterPanel
        terms={mockTerms}
        filters={{ category: [1] }} // Tech is selected
        onChange={() => {}}
        taxonomyConfig={mockConfig}
        taxonomyLabels={{ category: 'Categories' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Categories/i }));

    const clearButton = screen.getByRole('button', { name: /Clear Categories filter/i });
    expect(clearButton).toBeInTheDocument();
  });
});
