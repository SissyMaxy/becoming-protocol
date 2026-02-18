// Error Boundary Component
// Catches JavaScript errors in child component tree and displays fallback UI

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error for debugging
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center p-6 rounded-xl bg-red-900/20 border border-red-700/30">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
          <h3 className="text-lg font-semibold text-red-400 mb-1">
            Something went wrong
          </h3>
          <p className="text-sm text-red-300/70 text-center mb-4 max-w-md">
            {this.props.componentName
              ? `Error in ${this.props.componentName}`
              : 'An error occurred in this component'}
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="text-xs text-red-300/50 bg-red-900/30 p-2 rounded mb-4 max-w-full overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
): React.FC<P> {
  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary componentName={componentName || WrappedComponent.displayName}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `WithErrorBoundary(${componentName || WrappedComponent.displayName || 'Component'})`;

  return WithErrorBoundary;
}

// Minimal inline error boundary for small components
export function ErrorFallback({ message = 'Error loading content' }: { message?: string }) {
  return (
    <div className="p-4 rounded-lg bg-red-900/10 border border-red-700/20 text-center">
      <p className="text-sm text-red-400">{message}</p>
    </div>
  );
}
