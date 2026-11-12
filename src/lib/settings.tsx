import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { LOGO_URL } from './util'

// Public business details from the settings table, so contact details,
// mission and links are edited in Settings rather than in code.
const DEFAULTS: Record<string, unknown> = {
  'business.name': 'Top Mind Enterprise',
  'business.tagline': 'Language learning without fear of mistakes',
  'business.email': 'etopmind@gmail.com',
  'business.phone': '+60 10-522 1300',
  'business.whatsapp': '60105221300',
  'business.address': '',
  'business.instagram_url': 'https://www.instagram.com/topmind_enterprise/',
  'business.tiktok_url': 'https://www.tiktok.com/@topmind_enterprise',
  'business.logo_url': LOGO_URL,
  'business.mission': 'To make language learning accessible, enjoyable and meaningful by providing a safe and supportive environment where learners can build strong foundations, express themselves confidently and learn without fear of making mistakes.',
  'business.vision': 'To become a trusted global language-learning brand that empowers people to communicate confidently through accessible online education and welcoming physical learning centres, with the long-term ambition of expanding internationally through language centres and franchises.',
  'finance.currency_symbol': 'RM',
  'booking.cancellation_window_hours': 24,
  'privacy.policy_updated': '2026-11-02',
}

type Settings = { get: (key: string) => string; num: (key: string) => number; raw: Record<string, unknown>; reload: () => void }
const Ctx = createContext<Settings>({ get: (k) => String(DEFAULTS[k] ?? ''), num: (k) => Number(DEFAULTS[k] ?? 0), raw: DEFAULTS, reload: () => {} })

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<Record<string, unknown>>(DEFAULTS)
  const load = () => {
    supabase.rpc('public_settings').then(({ data }) => {
      if (data && typeof data === 'object') setRaw({ ...DEFAULTS, ...(data as Record<string, unknown>) })
    })
  }
  useEffect(load, [])
  const value: Settings = {
    raw,
    get: (k) => String(raw[k] ?? DEFAULTS[k] ?? ''),
    num: (k) => Number(raw[k] ?? DEFAULTS[k] ?? 0),
    reload: load,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useSettings = () => useContext(Ctx)
export const useCurrency = () => useSettings().get('finance.currency_symbol') || 'RM'
