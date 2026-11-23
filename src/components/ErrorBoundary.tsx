import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack: string;
  failingUrl: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
    stack: '',
    failingUrl: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
      stack: error.stack || '',
      failingUrl: typeof window !== 'undefined' ? window.location.href : '',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught ErrorBoundary error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-6 space-y-4 text-center">
            <h1 className="text-lg font-bold text-slate-900">
              Unable to load PRESENZA
            </h1>
            <p className="text-sm text-slate-600">
              An unexpected error occurred while rendering this page. Diagnostic details are shown below.
            </p>
            <div className="text-left rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs space-y-1.5 break-all">
              <div>
                <span className="font-semibold text-rose-900">Failing URL: </span>
                <span className="font-mono-tabular text-slate-800">
                  {this.state.failingUrl || 'N/A'}
                </span>
              </div>
              <div>
                <span className="font-semibold text-rose-900">Error: </span>
                <span className="font-mono-tabular text-rose-800">
                  {this.state.message}
                </span>
              </div>
              <div>
                <span className="font-semibold text-rose-900">Component: </span>
                <span className="font-mono-tabular text-slate-800">
                  ErrorBoundary (React Render Tree)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
