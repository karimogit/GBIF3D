import { act, fireEvent, render, screen } from '@testing-library/react';
import Lightbox from '@/components/Lightbox';
import { LIGHTBOX_EVENT } from '@/components/globe/constants';

function openLightbox(detail: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(new CustomEvent(LIGHTBOX_EVENT, { detail }));
  });
}

describe('Lightbox', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing until an event opens it', () => {
    render(<Lightbox />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with an https URL', () => {
    render(<Lightbox />);
    openLightbox({ url: 'https://api.gbif.org/v1/image/cache/a.jpg' });
    expect(screen.getByRole('dialog', { name: /photo lightbox/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /occurrence photo/i })).toHaveAttribute(
      'src',
      'https://api.gbif.org/v1/image/cache/a.jpg'
    );
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/svg+xml,<svg onload=alert(1)>'],
    ['http:', 'http://example.com/a.jpg'],
  ])('ignores %s URLs', (_scheme, url) => {
    render(<Lightbox />);
    openLightbox({ url });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rejects a URL list when any entry is not https', () => {
    render(<Lightbox />);
    openLightbox({ urls: ['https://ok.example/a.jpg', 'javascript:alert(1)'] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates with arrow keys and wraps around', () => {
    render(<Lightbox />);
    openLightbox({
      urls: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
      index: 2,
    });
    const img = () => screen.getByRole('img', { name: /occurrence photo/i });
    expect(img()).toHaveAttribute('src', 'https://x/3.jpg');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(img()).toHaveAttribute('src', 'https://x/1.jpg');

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(img()).toHaveAttribute('src', 'https://x/3.jpg');
  });

  it('closes on Escape and restores focus to the previously focused element', () => {
    render(
      <>
        <button type="button">outside</button>
        <Lightbox />
      </>
    );
    const outside = screen.getByRole('button', { name: 'outside' });
    outside.focus();

    openLightbox({ url: 'https://x/1.jpg' });
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
  });

  it('traps Tab inside the dialog', () => {
    render(<Lightbox />);
    openLightbox({ urls: ['https://x/1.jpg', 'https://x/2.jpg'] });
    act(() => {
      jest.runOnlyPendingTimers();
    });
    const dialog = screen.getByRole('dialog');

    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(window, { key: 'Tab' });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });
});
