import clsx from 'clsx'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export function cx(...parts: Array<string | false | null | undefined>) {
  return clsx(parts)
}

export function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen text-[var(--ink)]">{children}</div>
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',
        variant === 'primary' && 'bg-[var(--accent)] text-white hover:brightness-110 focus-visible:outline-[var(--accent)]',
        variant === 'secondary' &&
          'border border-[var(--line)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] focus-visible:outline-[var(--accent)]',
        variant === 'danger' && 'bg-[var(--danger)] text-white hover:brightness-110',
        variant === 'ghost' && 'hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)]',
        className,
      )}
      {...props}
    />
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]',
        props.className,
      )}
    />
  )
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        'w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]',
        props.className,
      )}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{children}</label>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger' }) {
  return (
    <span
      className={cx(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tone === 'neutral' && 'bg-[color-mix(in_oklab,var(--ink)_8%,transparent)] text-[var(--muted)]',
        tone === 'ok' && 'bg-[color-mix(in_oklab,var(--ok)_18%,transparent)] text-[var(--ok)]',
        tone === 'warn' && 'bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-[var(--warn)]',
        tone === 'danger' && 'bg-[color-mix(in_oklab,var(--danger)_18%,transparent)] text-[var(--danger)]',
      )}
    >
      {children}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-[var(--muted)]">{body}</p>
    </Card>
  )
}

export function statusTone(status: string): 'neutral' | 'ok' | 'warn' | 'danger' {
  if (['PUBLISHED', 'SCHEDULED', 'READY_FOR_REVIEW', 'connected', 'healthy', 'success'].includes(status)) return 'ok'
  if (['RETRY_WAIT', 'DRAFT', 'expiring', 'degraded', 'partial', 'UNKNOWN_OUTCOME'].includes(status)) return 'warn'
  if (['FAILED', 'NEEDS_REAUTH', 'REJECTED', 'expired', 'revoked', 'failed', 'cooldown'].includes(status)) return 'danger'
  return 'neutral'
}

export function ErrorBoundaryFallback({ error }: { error: Error }) {
  return (
    <div className="mx-auto max-w-lg p-8">
      <Card>
        <h2 className="font-display text-2xl font-bold">Something went wrong</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{error.message}</p>
      </Card>
    </div>
  )
}
