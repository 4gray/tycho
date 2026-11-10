import { Component, type ReactNode } from 'react';

/** Keeps one broken view from blanking the whole window. Resets when `resetKey` changes. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { key: string }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null;
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty">
        <b>This view hit an error</b>
        {this.state.error.message}
      </div>
    );
  }
}
