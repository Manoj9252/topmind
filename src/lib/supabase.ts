import { createClient } from '@supabase/supabase-js'
import { executeMockFunction, executeMockRpc, isDemoActive, MockQueryBuilder, readDemoSession } from './mockData'
import { LOGO_URL } from './util'

export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
export const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
export const configured = Boolean(supabaseUrl && supabaseKey && !supabaseUrl.includes('YOUR-PROJECT'))

// Only the public anon key ever reaches the browser. Access is decided by
// row-level security and the database functions, never by the frontend.
export const rawSupabase = createClient(configured ? supabaseUrl : 'http://localhost:54321', configured ? supabaseKey : 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

const shouldUseMock = () => !configured || isDemoActive()

const authProxy = new Proxy(rawSupabase.auth, {
  get(target, prop) {
    if (prop === 'updateUser' && shouldUseMock()) {
      return async () => ({
        data: { user: readDemoSession()?.session?.user ?? null },
        error: null,
      })
    }
    const value = Reflect.get(target, prop, target)
    return typeof value === 'function' ? value.bind(target) : value
  },
})

export const supabase = {
  auth: authProxy,
  from: ((relation: string) =>
    shouldUseMock() ? (new MockQueryBuilder(relation) as any) : rawSupabase.from(relation)) as typeof rawSupabase.from,
  rpc: ((fn: string, args?: Record<string, unknown>, options?: any) =>
    shouldUseMock() ? Promise.resolve(executeMockRpc(fn, args)) : rawSupabase.rpc(fn, args, options)) as typeof rawSupabase.rpc,
  functions: {
    invoke: ((name: string, options?: { body?: Record<string, unknown> }) =>
      shouldUseMock()
        ? Promise.resolve(executeMockFunction(name, options?.body ?? {}))
        : rawSupabase.functions.invoke(name, options)) as typeof rawSupabase.functions.invoke,
  },
  storage: {
    from: ((bucket: string) =>
      shouldUseMock()
        ? ({
            upload: async (path: string) => ({ data: { path }, error: null }),
            createSignedUrl: async () => ({ data: { signedUrl: LOGO_URL }, error: null }),
            getPublicUrl: (path: string) => ({ data: { publicUrl: `/demo-storage/${bucket}/${path}` } }),
            remove: async () => ({ data: [], error: null }),
          } as any)
        : rawSupabase.storage.from(bucket)) as typeof rawSupabase.storage.from,
  },
}
