'use client';

import { useMemo, useRef, useState } from 'react';
import type { GBIFOccurrence } from '@/types/gbif';
import { occurrenceYear, occurrenceMonth } from '@/lib/occurrence-date';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Year → count from occurrences that have a year. */
function yearCounts(occurrences: GBIFOccurrence[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const o of occurrences) {
    const y = occurrenceYear(o);
    if (y != null) map.set(y, (map.get(y) ?? 0) + 1);
  }
  return map;
}

/** (year, month) → count for occurrences that have month info. */
function yearMonthCounts(occurrences: GBIFOccurrence[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of occurrences) {
    const y = occurrenceYear(o);
    const m = occurrenceMonth(o);
    if (y != null && m != null) {
      const key = `${y}-${m}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

interface OccurrenceTimelineProps {
  occurrences: GBIFOccurrence[];
  selectedYear: number | null;
  selectedMonth: number | null;
  onYearChange: (year: number | null) => void;
  onMonthChange: (month: number | null) => void;
}

const TRACK_HEIGHT = 32;
const SEGMENT_MIN_WIDTH = 56;

export default function OccurrenceTimeline({
  occurrences,
  selectedYear,
  selectedMonth,
  onYearChange,
  onMonthChange,
}: OccurrenceTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const { years, counts, maxCount, yearMonthCountsMap } = useMemo(() => {
    const countsMap = yearCounts(occurrences);
    const ymMap = yearMonthCounts(occurrences);
    if (countsMap.size === 0) return { years: [] as number[], counts: countsMap, maxCount: 0, yearMonthCountsMap: ymMap };
    const sorted = Array.from(countsMap.keys()).sort((a, b) => a - b);
    const max = Math.max(...countsMap.values(), 1);
    return { years: sorted, counts: countsMap, maxCount: max, yearMonthCountsMap: ymMap };
  }, [occurrences]);

  const monthMaxCount =
    selectedYear != null
      ? Math.max(
          ...Array.from({ length: 12 }, (_, i) => yearMonthCountsMap.get(`${selectedYear}-${i + 1}`) ?? 0),
          1
        )
      : 1;

  if (years.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Occurrence timeline (scrollbar)"
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 24,
        width: 'min(92vw, 720px)',
        padding: '8px 12px',
        background: 'rgba(18, 22, 28, 0.94)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        zIndex: 900,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Scrollbar-style year track */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => { onYearChange(null); onMonthChange(null); }}
            aria-pressed={selectedYear === null}
            style={{
              flexShrink: 0,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: selectedYear === null ? 600 : 500,
              color: selectedYear === null ? '#4caf50' : 'rgba(255,255,255,0.85)',
              background: selectedYear === null ? 'rgba(76, 175, 80, 0.25)' : 'transparent',
              border: '1px solid ' + (selectedYear === null ? '#4caf50' : 'rgba(255,255,255,0.2)'),
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            All
          </button>
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              minWidth: 0,
              height: TRACK_HEIGHT,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 2,
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollBehavior: 'smooth',
              padding: '4px 0',
            }}
          >
            {years.map((year) => {
              const count = counts.get(year) ?? 0;
              const isSelected = selectedYear === year;
              const isHover = hoverYear === year;
              const barHeight = maxCount > 0 ? Math.max(6, (count / maxCount) * (TRACK_HEIGHT - 8)) : 8;
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => { onYearChange(year); onMonthChange(null); }}
                  onMouseEnter={() => setHoverYear(year)}
                  onMouseLeave={() => setHoverYear(null)}
                  aria-pressed={isSelected}
                  title={`${year}: ${count} occurrence${count !== 1 ? 's' : ''}`}
                  style={{
                    flexShrink: 0,
                    minWidth: SEGMENT_MIN_WIDTH,
                    width: SEGMENT_MIN_WIDTH,
                    maxWidth: SEGMENT_MIN_WIDTH,
                    height: TRACK_HEIGHT - 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    padding: 0,
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                    background: isSelected
                      ? 'rgba(76, 175, 80, 0.35)'
                      : isHover
                        ? 'rgba(255,255,255,0.08)'
                        : 'transparent',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: TRACK_HEIGHT - 4,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        width: '80%',
                        minHeight: Math.max(barHeight, 6),
                        maxHeight: TRACK_HEIGHT - 18,
                        borderRadius: 3,
                        background: isSelected ? '#4caf50' : 'rgba(255,255,255,0.6)',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: isSelected ? '#4caf50' : 'rgba(255,255,255,0.85)',
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {year}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <span
            style={{
              flexShrink: 0,
              fontSize: 11,
              color: 'rgba(255,255,255,0.8)',
              minWidth: 48,
              textAlign: 'right',
              whiteSpace: 'nowrap',
            }}
          >
            {hoverYear != null || selectedYear != null
              ? (counts.get(hoverYear ?? selectedYear ?? 0) ?? 0).toLocaleString()
              : ''}
          </span>
        </div>

        {/* Month strip when a year is selected */}
        {selectedYear != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
                Month:
              </span>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, flex: 1, minHeight: 20 }}>
                {MONTH_LABELS.map((label, i) => {
                  const month = i + 1;
                  const key = `${selectedYear}-${month}`;
                  const count = yearMonthCountsMap.get(key) ?? 0;
                  const isSelected = selectedMonth === month;
                  const h = monthMaxCount > 0 ? Math.max(4, (count / monthMaxCount) * 16) : 4;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onMonthChange(isSelected ? null : month)}
                      aria-pressed={isSelected}
                      title={`${label} ${selectedYear}: ${count}`}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 20,
                        minHeight: h,
                        padding: 0,
                        border: 'none',
                        borderRadius: 1,
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(76, 175, 80, 0.4)' : 'rgba(255,255,255,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 8,
                        fontWeight: 600,
                        color: '#fff',
                        position: 'relative',
                      }}
                    >
                      {count > 0 ? count : ''}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
                {selectedMonth != null ? MONTH_LABELS[selectedMonth - 1] : 'all'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 1, flex: 1, paddingLeft: 48 }}>
              {MONTH_LABELS.map((label) => (
                <span
                  key={label}
                  style={{
                    flex: 1,
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.6)',
                    textAlign: 'center',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
