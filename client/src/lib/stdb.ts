// SpacetimeDB HTTP API client

const STDB_HOST = import.meta.env.VITE_STDB_HOST ?? 'http://localhost:3000'
const STDB_MODULE = import.meta.env.VITE_STDB_MODULE ?? 'trippulse'

const IDENTITY_STORAGE_KEY = 'trippulse_stdb_identity'

export interface StdbIdentity {
  identity: string
  token: string
}

/** Remove old localStorage keys left over from pre-SpacetimeDB versions */
export function clearLegacyLocalStorage(): void {
  const keep = new Set([IDENTITY_STORAGE_KEY, 'trippulse_accounts', 'trippulse_session'])
  const toDelete: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('trippulse_') && !keep.has(key)) toDelete.push(key)
  }
  toDelete.forEach(k => localStorage.removeItem(k))
  if (toDelete.length > 0) console.info('[stdb] cleared legacy keys:', toDelete)
}

/** Get or create a SpacetimeDB identity, persisted to localStorage */
export async function getOrCreateIdentity(): Promise<StdbIdentity> {
  const stored = localStorage.getItem(IDENTITY_STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as StdbIdentity
      if (parsed.identity && parsed.token) return parsed
    } catch { /* fall through */ }
  }

  const res = await fetch(`${STDB_HOST}/v1/identity`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to create identity: ${res.status}`)
  const data = await res.json() as StdbIdentity
  localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(data))
  return data
}

/** Call a reducer on the SpacetimeDB module */
export async function callReducer(
  token: string,
  name: string,
  args: unknown[],
): Promise<void> {
  console.info(`[stdb] callReducer: ${name}`, args)
  const res = await fetch(
    `${STDB_HOST}/v1/database/${STDB_MODULE}/call/${name}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Reducer ${name} failed (${res.status}): ${text}`)
  }
}

/**
 * Normalise a single STDB row cell value.
 * SpacetimeDB v1 SQL rows encode:
 *   Identity  →  ["0xhexstring"]   (array with one hex-prefixed string)
 *   Timestamp →  [microseconds]    (array with one integer)
 *   Everything else is a plain JSON scalar.
 */
function normaliseValue(v: unknown): unknown {
  if (Array.isArray(v) && v.length === 1) {
    const inner = v[0]
    if (typeof inner === 'string' && inner.startsWith('0x')) return inner.slice(2)
    if (typeof inner === 'number') return inner
  }
  return v
}

/** Parse SpacetimeDB SQL response — handles both array-of-objects and schema+rows formats */
function parseRows<T = Record<string, unknown>>(data: unknown): T[] {
  if (!Array.isArray(data)) return []

  // Array-of-objects format
  if (data.length === 0) return []
  const first = data[0]
  if (typeof first === 'object' && first !== null && !('schema' in first) && !('rows' in first)) {
    return (data as Record<string, unknown>[]).map(row => {
      const normalised: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) {
        normalised[k] = normaliseValue(v)
      }
      return normalised as T
    })
  }

  // Schema + rows format: [{schema: {elements: [{name: {some: "col"}}]}, rows: [[val, ...]]}]
  const results: T[] = []
  for (const chunk of data as Array<{ schema?: { elements?: Array<{ name?: { some?: string } }> }; rows?: unknown[][] }>) {
    if (!chunk.schema || !chunk.rows) continue
    const cols = (chunk.schema.elements ?? []).map(el => el.name?.some ?? '')
    for (const row of chunk.rows) {
      const obj: Record<string, unknown> = {}
      cols.forEach((col, i) => { obj[col] = normaliseValue(row[i]) })
      results.push(obj as T)
    }
  }
  return results
}

/** Execute a SQL query against the SpacetimeDB module */
export async function querySQL<T = Record<string, unknown>>(
  token: string,
  sql: string,
): Promise<T[]> {
  const res = await fetch(
    `${STDB_HOST}/v1/database/${STDB_MODULE}/sql`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: sql,
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`SQL query failed (${res.status}): ${text}`)
  }
  const data: unknown = await res.json()
  console.info('[stdb] querySQL raw:', JSON.stringify(data).slice(0, 300))
  return parseRows<T>(data)
}
