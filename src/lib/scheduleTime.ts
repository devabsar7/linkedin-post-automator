const KARACHI = 'Asia/Karachi'

/** Format a UTC ISO timestamp as `YYYY-MM-DDTHH:mm` in Asia/Karachi for datetime-local. */
export function toKarachiDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KARACHI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

/** Interpret `YYYY-MM-DDTHH:mm` as Asia/Karachi wall time → UTC ISO. Karachi is UTC+5 year-round. */
export function karachiDateTimeLocalToIso(local: string): string {
  const m = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) throw new Error('Invalid schedule datetime')
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const hh = Number(m[4])
  const mm = Number(m[5])
  return new Date(Date.UTC(y, mo - 1, d, hh - 5, mm, 0)).toISOString()
}

export function formatKarachi(iso: string | null | undefined): string {
  if (!iso) return 'Not scheduled'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Invalid date'
  return (
    d.toLocaleString(undefined, {
      timeZone: KARACHI,
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' Asia/Karachi'
  )
}
