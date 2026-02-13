type DurationUnit = 'd' | 'h' | 'm'

export function parseSince(raw: string): number {
  const m = raw.trim().match(/^([0-9]+)([dhm])$/i)
  if (!m) throw new Error(`Invalid --since value: ${raw}`)

  const n = Number(m[1])
  const unit = m[2].toLowerCase() as DurationUnit

  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --since value: ${raw}`)

  const msPerUnit: Record<DurationUnit, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
  }

  return n * msPerUnit[unit]
}

export function formatSince(raw: string): string {
  const m = raw.trim().match(/^([0-9]+)([dhm])$/i)
  if (!m) return raw
  const n = m[1]
  const unit = m[2].toLowerCase()
  const label = unit === 'd' ? 'day' : unit === 'h' ? 'hour' : 'minute'
  return `last ${n} ${label}${n === '1' ? '' : 's'}`
}
