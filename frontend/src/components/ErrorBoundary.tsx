import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Last-resort guard so a rendering bug shows a message instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode; label: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}]`, error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash" role="alert">
          <strong>{this.props.label} failed to load.</strong>
          <p>{this.state.error.message}</p>
          <button type="button" className="btn btn--ghost" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
