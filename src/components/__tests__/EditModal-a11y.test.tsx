import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditModal } from '../EditModal';

// Mock getPluginTab
jest.mock('@/components/fields', () => ({
  ...jest.requireActual('@/components/fields'),
  getPluginTab: () => null,
}));

describe('EditModal Accessibility', () => {
  it('close button has an accessible name', () => {
    render(
      <EditModal
        resource={null}
        terms={{}}
        onClose={() => {}}
        onSave={() => {}}
      />
    );

    // This will fail if the button doesn't have an accessible name like aria-label
    const closeButton = screen.getByRole('button', { name: /close modal/i });
    expect(closeButton).toBeInTheDocument();
  });
});
