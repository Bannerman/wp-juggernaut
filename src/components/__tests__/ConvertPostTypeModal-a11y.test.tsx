import { render, screen } from '@testing-library/react';
import { ConvertPostTypeModal } from '../ConvertPostTypeModal';

describe('ConvertPostTypeModal Accessibility', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        json: () => Promise.resolve({ values: {}, fullValues: {}, mappings: [], sourceFields: [] }),
        ok: true,
      })
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('close button has an accessible name', () => {
    const mockResource = {
      id: 1,
      title: 'Test',
      slug: 'test',
      status: 'publish',
      taxonomies: {},
      meta_box: {},
    };

    const mockPostType = {
      slug: 'post',
      name: 'Post',
      rest_base: 'posts',
    };

    render(
      <ConvertPostTypeModal
        resource={mockResource}
        currentPostType={mockPostType}
        postTypes={[mockPostType]}
        taxonomyConfig={[]}
        onClose={() => {}}
        onConvert={() => {}}
      />
    );

    // This will fail if the button doesn't have an accessible name like aria-label
    const closeButton = screen.getByRole('button', { name: /close modal/i });
    expect(closeButton).toBeInTheDocument();
  });
});
