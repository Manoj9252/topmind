import { Award, CalendarCheck, Quote, Sparkles, Trophy } from 'lucide-react'
import { AwardCategory, useStudentSpotlights } from '../lib/mockData'
import { initials } from '../lib/format'
import { cx } from '../lib/util'
import { Badge, Card } from './ui'

const CATEGORY_META: Record<AwardCategory, { icon: any; tone: string; ring: string }> = {
  'Most Improved Speaker': { icon: Award, tone: 'pink', ring: 'border-t-brand-pink' },
  'Perfect Attendance': { icon: CalendarCheck, tone: 'emerald', ring: 'border-t-emerald-500' },
  'Vocabulary Champion': { icon: Trophy, tone: 'navy', ring: 'border-t-brand-navy' },
  'Confidence Booster': { icon: Sparkles, tone: 'amber', ring: 'border-t-amber-500' },
}

export default function AchievementShowcase({
  compact = false,
  limit = 4,
}: {
  compact?: boolean
  limit?: number
}) {
  const spotlights = useStudentSpotlights()
    .filter((s) => s.featured_on_website)
    .slice(0, limit)

  if (!spotlights.length) return null

  return (
    <div className={compact ? 'space-y-4' : ''}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-pink/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-pink">
            <Trophy size={13} />
            Student Spotlight · Hall of Fame
          </span>
          <h2 className="mt-2 text-2xl font-extrabold text-brand-navy sm:text-3xl">
            Celebrating Learner Milestones
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Real adults and young learners building speaking confidence one milestone at a time.
          </p>
        </div>
      </div>

      <div className={cx('grid gap-5', compact ? 'sm:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-4')}>
        {spotlights.map((spot) => {
          const meta = CATEGORY_META[spot.category] ?? CATEGORY_META['Most Improved Speaker']
          const Icon = meta.icon
          return (
            <Card key={spot.id} className={cx('flex h-full flex-col border-t-4 transition hover:-translate-y-0.5 hover:shadow-md', meta.ring)}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {spot.avatar_url ? (
                    <img
                      src={spot.avatar_url}
                      alt={spot.student_name}
                      className="h-11 w-11 rounded-2xl object-cover ring-2 ring-brand-cream-dark"
                    />
                  ) : (
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-navy to-brand-pink font-bold text-white shadow-sm">
                      {initials(spot.student_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-brand-navy">{spot.student_name}</h3>
                    <p className="truncate text-xs text-slate-500">{spot.language_level}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5">
                <Badge
                  tone={meta.tone}
                  text={
                    <span className="inline-flex items-center gap-1">
                      <Icon size={12} />
                      {spot.category}
                    </span>
                  }
                />
                <span className="text-[11px] font-medium text-slate-400">{spot.month_label}</span>
              </div>

              <div className="mt-3 flex-1 rounded-xl bg-brand-cream/45 p-3 text-sm leading-relaxed text-slate-700">
                <Quote size={14} className="mb-1 text-brand-pink" />
                <p className="italic">“{spot.quote}”</p>
              </div>

              <p className="mt-3 text-xs font-medium text-slate-500">
                Recommended by <span className="text-brand-navy">{spot.teacher_name}</span>
              </p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
