import { act, fireEvent, render, screen } from '@testing-library/react';
import OccurrenceTimeline from '@/components/OccurrenceTimeline';
import type { GBIFOccurrence } from '@/types/gbif';

function occ(key: number, year?: number, month?: number): GBIFOccurrence {
  return { key, year, month } as GBIFOccurrence;
}

const SAMPLE = [occ(1, 2019, 3), occ(2, 2020, 5), occ(3, 2020, 5), occ(4, 2021), occ(5)];

describe('OccurrenceTimeline', () => {
  it('renders nothing when no occurrence has a year', () => {
    const { container } = render(
      <OccurrenceTimeline
        occurrences={[occ(1), occ(2)]}
        selectedYear={null}
        selectedMonth={null}
        onYearChange={jest.fn()}
        onMonthChange={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one button per distinct year, sorted, with counts in the tooltip', () => {
    render(
      <OccurrenceTimeline
        occurrences={SAMPLE}
        selectedYear={null}
        selectedMonth={null}
        onYearChange={jest.fn()}
        onMonthChange={jest.fn()}
      />
    );
    const yearButtons = screen
      .getAllByRole('button')
      .filter((b) => /^\d{4}: \d+ occurrence/.test(b.getAttribute('title') ?? ''));
    expect(yearButtons.map((b) => b.textContent)).toEqual(['2019', '2020', '2021']);
    expect(screen.getByTitle('2020: 2 occurrences')).toBeInTheDocument();
    expect(screen.getByTitle('2021: 1 occurrence')).toBeInTheDocument();
  });

  it('selecting a year clears the month; "All" clears both', () => {
    const onYearChange = jest.fn();
    const onMonthChange = jest.fn();
    render(
      <OccurrenceTimeline
        occurrences={SAMPLE}
        selectedYear={2019}
        selectedMonth={3}
        onYearChange={onYearChange}
        onMonthChange={onMonthChange}
      />
    );

    fireEvent.click(screen.getByTitle('2020: 2 occurrences'));
    expect(onYearChange).toHaveBeenLastCalledWith(2020);
    expect(onMonthChange).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onYearChange).toHaveBeenLastCalledWith(null);
    expect(onMonthChange).toHaveBeenLastCalledWith(null);
  });

  it('shows the month strip only when a year is selected and toggles a month', () => {
    const onMonthChange = jest.fn();
    const { rerender } = render(
      <OccurrenceTimeline
        occurrences={SAMPLE}
        selectedYear={null}
        selectedMonth={null}
        onYearChange={jest.fn()}
        onMonthChange={onMonthChange}
      />
    );
    expect(screen.queryByRole('button', { name: /May 2020/ })).not.toBeInTheDocument();

    rerender(
      <OccurrenceTimeline
        occurrences={SAMPLE}
        selectedYear={2020}
        selectedMonth={null}
        onYearChange={jest.fn()}
        onMonthChange={onMonthChange}
      />
    );
    const may = screen.getByRole('button', { name: 'May 2020: 2 occurrences' });
    fireEvent.click(may);
    expect(onMonthChange).toHaveBeenLastCalledWith(5);

    rerender(
      <OccurrenceTimeline
        occurrences={SAMPLE}
        selectedYear={2020}
        selectedMonth={5}
        onYearChange={jest.fn()}
        onMonthChange={onMonthChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'May 2020: 2 occurrences' }));
    expect(onMonthChange).toHaveBeenLastCalledWith(null);
  });

  it('play steps month by month and stops at the end', () => {
    jest.useFakeTimers();
    const onYearChange = jest.fn();
    const onMonthChange = jest.fn();
    render(
      <OccurrenceTimeline
        occurrences={[occ(1, 2020, 1)]}
        selectedYear={null}
        selectedMonth={null}
        onYearChange={onYearChange}
        onMonthChange={onMonthChange}
      />
    );
    const play = screen.getByRole('button', { name: 'Play' });
    fireEvent.click(play);
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');

    act(() => {
      jest.advanceTimersByTime(250 * 2);
    });
    expect(onYearChange).toHaveBeenCalledWith(2020);
    expect(onMonthChange.mock.calls.map((c) => c[0])).toEqual([1, 2]);

    // 12 months for a single year, then one more tick stops playback.
    act(() => {
      jest.advanceTimersByTime(250 * 11);
    });
    expect(onMonthChange).toHaveBeenLastCalledWith(12);
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
    jest.useRealTimers();
  });
});
