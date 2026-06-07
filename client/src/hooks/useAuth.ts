import { createContext, useContext, useState, useEffect, useCallback, type ReactNode, createElement } from 'react'
import { getOrCreateIdentity } from '../lib/stdb'

export interface AuthUser {
  name: string
  email: string
}

interface StoredAccount {
  name: string
  email: string
  passwordHash: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signUp: (name: string, email: string, password: string) => Promise<{ error?: string }>
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => void
}

const ACCOUNTS_KEY = 'trippulse_accounts'
const SESSION_KEY  = 'trippulse_session'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getAccounts(): Record<string, StoredAccount> {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}') } catch { return {} }
}

function saveAccounts(accounts: Record<string, StoredAccount>) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

// Attempt to ensure an STDB identity exists and register the user profile
async function syncWithStdb(name: string, email: string): Promise<void> {
  try {
    const { token } = await getOrCreateIdentity()
    // Dynamically import to avoid circular dependency with StdbContext
    const { callReducer } = await import('../lib/stdb')
    // Pick a deterministic avatar color from name
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4']
    const color = colors[name.charCodeAt(0) % colors.length]
    await callReducer(token, 'register', [name, email, color])
  } catch (err) {
    // Non-fatal: STDB may not be running locally during dev
    console.warn('[useAuth] STDB sync failed (non-fatal):', err)
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const session = localStorage.getItem(SESSION_KEY)
      if (session) setUser(JSON.parse(session))
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const signUp = useCallback(async (
    name: string,
    email: string,
    password: string,
  ): Promise<{ error?: string }> => {
    const accounts = getAccounts()
    const key = email.toLowerCase()
    if (accounts[key]) return { error: 'An account with this email already exists.' }
    if (password.length < 6) return { error: 'Password must be at least 6 characters.' }
    const passwordHash = await sha256(password)
    accounts[key] = { name: name.trim(), email: key, passwordHash }
    saveAccounts(accounts)
    const newUser: AuthUser = { name: name.trim(), email: key }
    localStorage.setItem(SESSION_KEY, JSON.stringify(newUser))
    setUser(newUser)
    // Sync with SpacetimeDB (non-blocking)
    syncWithStdb(name.trim(), key).catch(() => {})
    return {}
  }, [])

  const signIn = useCallback(async (
    email: string,
    password: string,
  ): Promise<{ error?: string }> => {
    const accounts = getAccounts()
    const key = email.toLowerCase()
    const account = accounts[key]
    if (!account) return { error: 'No account found with that email.' }
    const passwordHash = await sha256(password)
    if (account.passwordHash !== passwordHash) return { error: 'Incorrect password.' }
    const sessionUser: AuthUser = { name: account.name, email: account.email }
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
    setUser(sessionUser)
    // Sync with SpacetimeDB (non-blocking)
    syncWithStdb(account.name, account.email).catch(() => {})
    return {}
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }, [])

  return createElement(AuthContext.Provider, { value: { user, loading, signUp, signIn, signOut } }, children)
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
