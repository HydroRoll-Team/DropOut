import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Application render failed:", error, errorInfo);
  }

  public render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-8">
        <div className="max-w-3xl w-full border border-red-500/30 bg-red-500/10 p-6 space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-red-300">
              Render Failure
            </p>
            <h1 className="text-2xl font-semibold">The launcher failed to render</h1>
          </div>

          <p className="text-sm text-zinc-300">
            A runtime error interrupted the UI before the launcher could finish mounting.
          </p>

          <pre className="overflow-auto bg-black/30 p-4 text-xs text-red-100 whitespace-pre-wrap break-words">
            {error.stack || error.message}
          </pre>
        </div>
      </div>
    );
  }
}
