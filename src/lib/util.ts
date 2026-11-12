// Reads a nested value such as "students.full_name" from a row.
export const get = (o: any, p: string) => p.split('.').reduce((a: any, k) => (a == null ? a : a[k]), o)

// Joins truthy class names.
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

/** Resolves an asset or route path against Vite's configured base URL for subpath hosting (e.g. GitHub Pages). */
export const appPath = (path = '') => {
  const rawBase = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL) || '/'
  ;(globalThis as any).__TOPMIND_BASE__ = rawBase
  const base = String(rawBase).replace(/\/+$/, '')
  const clean = path.replace(/^\/+/, '')
  return clean ? `${base}/${clean}` : `${base || ''}/`
}

/** Builds a full origin-prefixed URL respecting the configured app base path. */
export const appOriginUrl = (path = '') => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${appPath(path)}`
}

export const LOGO_URL = appPath('logo.jpeg')
