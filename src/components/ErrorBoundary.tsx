import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorBoundaryFallback } from './ui'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info)
  }

  render() {
    if (this.state.error) return <ErrorBoundaryFallback error={this.state.error} />
    return this.props.children
  }
}
