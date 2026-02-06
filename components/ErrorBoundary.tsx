'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: '#0a0a0f',
            color: '#fff',
            fontFamily: "Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif",
          }}
        >
          <strong style={{ marginBottom: 8 }}>Something went wrong</strong>
          <p style={{ margin: 0, opacity: 0.9, fontSize: 14 }}>
            The globe failed to load. Try refreshing the page.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
