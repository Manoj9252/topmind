import { rpc, useLoad } from './api'

export type CatalogClass = {
  id: string; name: string; type: string; mode: string; level: string | null; schedule: string; start_date: string | null
  fee: number; billing_frequency: string; timezone: string; spaces_left: number; teacher: string | null
}
export type Programme = {
  id: string; name: string; slug: string; summary: string | null; description: string | null; audience: string; formats: string[]
  levels: { id: string; name: string; monthly_fee: number; description: string | null }[]; classes: CatalogClass[]; has_assessment: boolean
}
export type Language = { id: string; name: string; slug: string; description: string | null; is_active: boolean; programmes: Programme[] }
export type Catalog = { languages: Language[]; one_to_one: boolean }

let cached: Promise<Catalog> | null = null

// The public catalogue: languages, programmes, fees and open classes, straight
// from the database (no meeting links or private details).
export function useCatalog() {
  return useLoad(() => {
    cached ??= rpc<Catalog>('public_catalog').catch((e) => { cached = null; throw e })
    return cached
  }, [])
}

export const feeText = (fee: number, freq: string, symbol = 'RM') =>
  !fee ? 'Free' : `${symbol} ${Number(fee).toFixed(2)}${freq === 'monthly' ? ' / month' : freq === 'per_lesson' ? ' / lesson' : ''}`
