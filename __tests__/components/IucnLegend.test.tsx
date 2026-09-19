import { render, screen, within } from '@testing-library/react';
import IucnLegend from '@/components/IucnLegend';
import { IUCN_LEGEND_ITEMS } from '@/lib/iucn';

describe('IucnLegend', () => {
  it('renders one swatch per IUCN legend item', () => {
    render(<IucnLegend />);
    const group = screen.getByRole('group', {
      name: /IUCN status colour legend/i,
    });
    for (const item of IUCN_LEGEND_ITEMS) {
      expect(within(group).getByText(item.label)).toBeInTheDocument();
    }
  });

  it('makes every legend item keyboard focusable', () => {
    render(<IucnLegend />);
    const group = screen.getByRole('group', {
      name: /IUCN status colour legend/i,
    });
    const focusable = group.querySelectorAll('[tabindex="0"]');
    expect(focusable).toHaveLength(IUCN_LEGEND_ITEMS.length);
  });
});
