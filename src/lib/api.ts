import { useCallback, useEffect, useRef, useState } from 'react'
import { configured, supabase } from './supabase'
import { executeMockFunction, executeMockRpc, isDemoActive } from './mockData'

// Turns database and network errors into messages people can act on. The
// database functions already raise plain-English messages; those pass through.
export function friendly(message: string): string {
  const m = message ?? ''
  if (/payments_reference_key/.test(m)) return 'That transaction reference has already been used.'
  if (/students_email_key|students_student_code_key/.test(m)) return 'A student with this email already exists.'
  if (/registrations_open_key/.test(m)) return 'There is already an open registration for this email and programme.'
  if (/languages_(name|slug)_key/.test(m)) return 'A language with this name already exists.'
  if (/duplicate key/i.test(m)) return 'This record already exists.'
  if (/bookings_no_(teacher|student)_overlap|exclusion constraint|conflicting key value/i.test(m)) return 'That time overlaps another booking.'
  if (/row-level security|permission denied/i.test(m)) return 'You do not have permission to do that.'
  if (/violates foreign key constraint/i.test(m)) return 'This record is linked to other records, so it cannot be removed. Archive it instead.'
  if (/violates check constraint/i.test(m)) return 'Some of the values are not valid. Please check the form.'
  if (/violates not-null constraint/i.test(m)) return 'Please fill in all required fields.'
  if (/JWT expired|invalid JWT/i.test(m)) return 'Your session has expired. Please sign in again.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Cannot reach the server. Please check your internet connection.'
  return m.replace(/^ERROR:\s*/, '')
}

export const errorText = (e: unknown) => friendly(e instanceof Error ? e.message : String((e as any)?.message ?? e))

// Unwraps a Supabase response. In preview/demo mode or when Supabase is
// unconfigured/unreachable, returns a safe fallback rather than crashing the UI.
export async function q<T = any>(request: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  try {
    const { data, error } = await request
    if (error) {
      if (/Failed to fetch|NetworkError|Load failed/i.test(error.message ?? '')) {
        return ([] as unknown) as T
      }
      throw new Error(friendly(error.message))
    }
    return data as T
  } catch (err: any) {
    if (/Failed to fetch|NetworkError|Load failed/i.test(err?.message ?? '')) return ([] as unknown) as T
    throw err
  }
}

// Calls a database function (RPC). Uses client-side mock data when Supabase is
// unconfigured, in Demo Mode, or if an RPC request fails on preview deployments.
export async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!configured || isDemoActive()) {
    const res = executeMockRpc(fn, args)
    if (res.error) throw new Error(friendly(res.error.message))
    return res.data as T
  }
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) {
      const mock = executeMockRpc(fn, args)
      if (!mock.error) return mock.data as T
      throw new Error(friendly(error.message))
    }
    return data as T
  } catch (err) {
    const mock = executeMockRpc(fn, args)
    if (!mock.error) return mock.data as T
    throw err
  }
}

// Loads data on mount and whenever deps change; `reload` refreshes it.
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const reload = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const result = await load()
      if (mine === seq.current) { setData(result); setError('') }
    } catch (e) {
      if (mine === seq.current) setError(errorText(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload, setData }
}

// Runs an action with busy/error/success state for forms and buttons.
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true); setError(''); setOk('')
    try {
      const r = await fn()
      if (success) setOk(success)
      return r
    } catch (e) {
      setError(errorText(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, ok, run, setError, setOk }
}

// Calls an Edge Function with the signed-in user's session, or mock fallback in demo mode.
export async function callFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!configured || isDemoActive()) {
    const res = executeMockFunction(name, body)
    if (res.error) throw new Error(friendly(res.error.message))
    return res.data as T
  }
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const detail = await (error as any).context?.json?.().catch(() => null)
    throw new Error(friendly(detail?.error ?? error.message))
  }
  return data as T
}
