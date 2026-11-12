import ResourcePage from '../../components/ResourcePage'
import { useCurrency } from '../../lib/settings'
import { money } from '../../lib/format'

// Expenses feed the net operating balance on the dashboard. They are financial
// records, so they can be corrected but not deleted.
export default function Expenses() {
  const sym = useCurrency()
  return (
    <ResourcePage table="expenses" title="Expenses" subtitle="Record rent, utilities, marketing and other costs so the monthly net balance is accurate." order="spent_on" canDelete={false}
      cols={[{ key: 'spent_on', label: 'Date' }, { key: 'category', label: 'Category' }, { key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount', render: (r) => money(r.amount, sym) }]}
      fields={[{ key: 'spent_on', label: 'Date', type: 'date', required: true, defaultValue: new Date().toLocaleDateString('en-CA') },
        { key: 'category', label: 'Category', type: 'select', required: true, options: ['Rent', 'Utilities', 'Marketing', 'Software', 'Materials', 'Training', 'Other'] },
        { key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount (RM)', type: 'number', required: true }]} />
  )
}
