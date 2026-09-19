import { render, screen } from '@testing-library/react';
import ErrorBoundary from '@/components/ErrorBoundary';

function Boom(): never {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    // React logs the caught error; keep test output quiet.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <span>globe</span>
      </ErrorBoundary>
    );
    expect(screen.getByText('globe')).toBeInTheDocument();
  });

  it('renders the default alert when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
    expect(consoleError).toHaveBeenCalled();
  });

  it('renders a custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<p>custom fallback</p>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('custom fallback')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
