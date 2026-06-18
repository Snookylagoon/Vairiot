import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 text-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Something went wrong</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{this.state.error.message}</p>
          <button
            className="rounded-md bg-v-pink px-4 py-2 text-sm font-medium text-white hover:bg-v-pink/90"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
