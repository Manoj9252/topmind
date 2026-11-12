import { useSettings } from '../../lib/settings'
import { Alert } from '../../components/ui'

// Shown when a login has no student record yet (for example, the email used
// to sign up differs from the one on the registration).
export function NotLinked() {
  const s = useSettings()
  return (
    <Alert tone="info" msg={<span>Your login is not linked to a student record yet. If you registered with a different email address, please contact us at{' '}
      <a className="underline" href={`mailto:${s.get('business.email')}`}>{s.get('business.email')}</a> or {s.get('business.phone')} and we will link it for you.</span>} />
  )
}
