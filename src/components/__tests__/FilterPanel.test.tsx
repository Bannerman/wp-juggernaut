import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '../FilterPanel';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronDown: () => <div data-testid="chevron-down" />,
  X: () => <div data-testid="x-icon" />,
}));

const mockTerms = {
  category: [
    { id: 1, taxonomy: 'category', name: 'Tech', slug: 'tech', parent_id: 0 },
  ],
};

const mockTaxonomyConfig = [
  { slug: 'category', name: 'Categories', rest_base: 'categories', show_in_filter: true },
];

describe('FilterPanel Accessibility', () => {
  it('has accessible labels for buttons', () => {
    const filters = { category: [1] };
    const onChange = jest.fn();

    render(
      <FilterPanel
        terms={mockTerms}
        filters={filters}
        onChange={onChange}
        taxonomyConfig={mockTaxonomyConfig}
      />
    );

    // 1. Check Global Clear All Button
    // It is rendered when there are active filters
    // Currently it has text "Clear all" but we want to ensure it has a specific aria-label if we decide to add one,
    // or at least that it's a button.
    const clearAllBtn = screen.getByRole('button', { name: /clear all/i });
    expect(clearAllBtn).toBeInTheDocument();

    // 2. Expand the category section to see the term buttons
    // The toggle button should be accessible.
    // We'll look for it by the taxonomy name.
    const toggleBtn = screen.getByRole('button', { name: /categories/i });
    expect(toggleBtn).toBeInTheDocument();

    // Click to expand
    fireEvent.click(toggleBtn);

    // 3. Check Taxonomy Clear Button
    // It appears when a term is selected in that taxonomy
    const clearTaxBtn = screen.getByRole('button', { name: /clear categories filter/i });
    expect(clearTaxBtn).toBeInTheDocument();

    // 4. Check Remove Term Button (X icon)
    // This is the critical one. It currently has no text, just an icon.
    // We expect to find it by its aria-label "Remove Tech filter".
    const removeTermBtn = screen.getByRole('button', { name: 'Remove Tech filter' });
    expect(removeTermBtn).toBeInTheDocument();
  });

  it('has proper aria attributes for accordion', () => {
     const filters = {};
     const onChange = jest.fn();

     render(
       <FilterPanel
         terms={mockTerms}
         filters={filters}
         onChange={onChange}
         taxonomyConfig={mockTaxonomyConfig}
       />
     );

     const toggleBtn = screen.getByRole('button', { name: /categories/i });

     // Initially not expanded
     expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

     // Click to expand
     fireEvent.click(toggleBtn);

     // Now expanded
     expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
     expect(toggleBtn).toHaveAttribute('aria-controls');
  });
});
