import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResourceTable } from "../ResourceTable";

// Mock utils if necessary, but for now assuming they work in test environment
// If formatRelativeTime uses Date, we might need to mock system time or just not test the exact string output of dates heavily.

const mockResources = [
  {
    id: 1,
    title: "Test Resource 1",
    slug: "test-resource-1",
    status: "publish",
    date_gmt: "2023-01-02T00:00:00",
    modified_gmt: "2023-01-02T00:00:00",
    is_dirty: false,
    taxonomies: {},
    meta_box: {},
  },
  {
    id: 2,
    title: "Test Resource 2",
    slug: "test-resource-2",
    status: "draft",
    date_gmt: "2023-01-01T00:00:00",
    modified_gmt: "2023-01-01T00:00:00",
    is_dirty: true,
    taxonomies: {},
    meta_box: {},
  },
];

const mockTerms = {};
const mockOnSelect = jest.fn();
const mockOnEdit = jest.fn();
const mockOnUpdate = jest.fn();

describe("ResourceTable", () => {
  it("renders resources correctly", () => {
    render(
      <ResourceTable
        resources={mockResources}
        terms={mockTerms}
        selectedIds={[]}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onUpdate={mockOnUpdate}
      />,
    );

    expect(screen.getByText("Test Resource 1")).toBeInTheDocument();
    expect(screen.getByText("Test Resource 2")).toBeInTheDocument();
  });

  it("has accessible labels for action buttons", () => {
    render(
      <ResourceTable
        resources={mockResources}
        terms={mockTerms}
        selectedIds={[]}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onUpdate={mockOnUpdate}
        siteUrl="https://example.com"
      />,
    );

    // Edit buttons - find by role button that contains the edit icon or title
    const editButtons = screen.getAllByTitle("Edit");
    expect(editButtons[0]).toHaveAttribute(
      "aria-label",
      "Edit Test Resource 1",
    );
    expect(editButtons[1]).toHaveAttribute(
      "aria-label",
      "Edit Test Resource 2",
    );

    // View buttons
    const viewButtons = screen.getAllByTitle("View on site");
    expect(viewButtons[0]).toHaveAttribute(
      "aria-label",
      "View Test Resource 1 on site",
    );
    expect(viewButtons[1]).toHaveAttribute(
      "aria-label",
      "View Test Resource 2 on site",
    );
  });

  it("has accessible labels for checkboxes", () => {
    render(
      <ResourceTable
        resources={mockResources}
        terms={mockTerms}
        selectedIds={[]}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onUpdate={mockOnUpdate}
      />,
    );

    // Select All checkbox (first one)
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAttribute("aria-label", "Select all resources");

    // Row checkboxes
    expect(checkboxes[1]).toHaveAttribute(
      "aria-label",
      "Select Test Resource 1",
    );
    expect(checkboxes[2]).toHaveAttribute(
      "aria-label",
      "Select Test Resource 2",
    );
  });

  it("indicates sort direction", () => {
    render(
      <ResourceTable
        resources={mockResources}
        terms={mockTerms}
        selectedIds={[]}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onUpdate={mockOnUpdate}
      />,
    );

    // Initial sort is modified_gmt desc (default in component)
    // Find the th that contains "Modified"
    const modifiedHeader = screen.getByText("Modified").closest("th");
    expect(modifiedHeader).toHaveAttribute("aria-sort", "descending");

    // Click title to sort (first click is asc)
    const titleHeader = screen.getByText("Title").closest("th");
    fireEvent.click(titleHeader!);
    expect(titleHeader).toHaveAttribute("aria-sort", "ascending");

    // Previous sort should be removed
    expect(modifiedHeader).not.toHaveAttribute("aria-sort");
  });

  it("shows empty state when no resources", () => {
    render(
      <ResourceTable
        resources={[]}
        terms={mockTerms}
        selectedIds={[]}
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onUpdate={mockOnUpdate}
      />,
    );

    expect(screen.getByText("No resources found")).toBeInTheDocument();
  });
});
