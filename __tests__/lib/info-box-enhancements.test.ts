import {
  clampInfoBoxPosition,
  toggleButtonAriaLabel,
  toggleButtonLabel,
} from '@/components/globe/info-box-layout';

describe('info-box-enhancements', () => {
  it('clamps position inside the parent viewport', () => {
    expect(clampInfoBoxPosition(-20, -10, 200, 100, 800, 600)).toEqual({ left: 8, top: 8 });
    expect(clampInfoBoxPosition(900, 700, 200, 100, 800, 600)).toEqual({ left: 592, top: 492 });
    expect(clampInfoBoxPosition(100, 80, 200, 100, 800, 600)).toEqual({ left: 100, top: 80 });
  });

  it('returns fold toggle labels', () => {
    expect(toggleButtonLabel(false)).toBe('▾');
    expect(toggleButtonLabel(true)).toBe('▸');
    expect(toggleButtonAriaLabel(false)).toBe('Collapse species info');
    expect(toggleButtonAriaLabel(true)).toBe('Expand species info');
  });
});
