import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-md shadow-md text-red-900 m-4 relative z-[9999] bg-white">
          <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
            <span>🚨</span> Component Crash
          </h2>
          <p className="text-sm mb-2 text-red-700">Something went wrong while rendering this component.</p>
          <pre className="text-xs bg-red-100 p-2 rounded overflow-auto border border-red-200">
            {this.state.error?.toString()}
          </pre>
          <pre className="text-[10px] mt-2 bg-red-100 p-2 rounded overflow-auto text-red-600 max-h-32">
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
