import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

import { ErrorBoundary } from '../components/ui/ErrorBoundary';

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test explosion');
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(<ErrorBoundary><ThrowingChild shouldThrow={false} /></ErrorBoundary>);
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders fallback UI on error', () => {
    render(<ErrorBoundary><ThrowingChild shouldThrow={true} /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  it('clears error state after clicking Try again', () => {
    let shouldThrow = true;
    function Conditional() {
      if (shouldThrow) throw new Error('Test explosion');
      return <div>All good</div>;
    }
    const { rerender } = render(<ErrorBoundary><Conditional /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByText('Try again'));
    rerender(<ErrorBoundary><Conditional /></ErrorBoundary>);
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});
