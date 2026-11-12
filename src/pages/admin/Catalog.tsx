import { useState } from 'react'
import ResourcePage from '../../components/ResourcePage'
import { useCurrency } from '../../lib/settings'
import { label, money } from '../../lib/format'
import { Badge, PageHeader, Tabs } from '../../components/ui'

// Languages, programmes, levels and places: all configured here, so adding a
// new language never needs a code change.
export default function Catalog() {
  const [tab, setTab] = useState<'languages' | 'programmes' | 'levels' | 'places'>('languages')
  const sym = useCurrency()
  return (
    <div>
      <PageHeader title="Languages and programmes" subtitle="What appears on the website and in registration comes from here." />
      <Tabs value={tab} onChange={setTab} tabs={[['languages', 'Languages'], ['programmes', 'Programmes'], ['levels', 'Levels and fees'], ['places', 'Centres and rooms']]} />
      {tab === 'languages' && (
        <ResourcePage embedded table="languages" title="Languages" order="sort_order" ascending canDelete={(r) => !r.is_active}
          cols={[{ key: 'name', label: 'Language' }, { key: 'slug', label: 'Web address', render: (r) => `/languages/${r.slug}` },
            { key: 'is_active', label: 'Open', render: (r) => r.is_active ? <Badge v="active" text="Open" /> : <Badge v="pending" text="Coming soon" /> },
            { key: 'sort_order', label: 'Order' }]}
          fields={[{ key: 'name', label: 'Name', required: true }, { key: 'native_name', label: 'Name in the language itself' },
            { key: 'slug', label: 'Web address', hint: 'Leave empty to create it from the name, e.g. "hindi".' },
            { key: 'description', label: 'Description (shown on the website)', type: 'textarea' },
            { key: 'is_active', label: 'Open for registration', type: 'checkbox' }, { key: 'sort_order', label: 'Order', type: 'number', step: '1', defaultValue: 10 }]} />
      )}
      {tab === 'programmes' && (
        <ResourcePage embedded table="courses" title="Programmes" select="*, languages(name)" order="sort_order" ascending canDelete={false}
          cols={[{ key: 'name', label: 'Programme' }, { key: 'languages.name', label: 'Language' }, { key: 'audience', label: 'For', render: (r) => label(r.audience) },
            { key: 'formats', label: 'Formats', render: (r) => (r.formats ?? []).map(label).join(', ') }, { key: 'active', label: 'Open' }]}
          fields={[{ key: 'name', label: 'Name', required: true, hint: 'e.g. English for Beginners' },
            { key: 'language_id', label: 'Language', type: 'select', required: true, from: { table: 'languages', label: 'name', order: 'sort_order' } },
            { key: 'summary', label: 'One-line summary' }, { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'audience', label: 'Who it is for', type: 'select', options: [['adults', 'Adults'], ['teens', 'Teenagers'], ['children', 'Children'], ['all', 'All ages']], defaultValue: 'adults' },
            { key: 'formats', label: 'Formats', type: 'multiselect', options: [['group', 'Group'], ['one_to_one', 'One-to-one']], defaultValue: ['group'] },
            { key: 'slug', label: 'Web address', hint: 'Leave empty to create it from the name.' },
            { key: 'active', label: 'Open for registration', type: 'checkbox' }, { key: 'sort_order', label: 'Order', type: 'number', step: '1', defaultValue: 10 }]} />
      )}
      {tab === 'levels' && (
        <ResourcePage embedded table="levels" title="Levels" select="*, courses(name)" order="rank" ascending
          cols={[{ key: 'courses.name', label: 'Programme' }, { key: 'name', label: 'Level' }, { key: 'rank', label: 'Order' },
            { key: 'monthly_fee', label: 'Standard monthly fee', render: (r) => money(r.monthly_fee, sym) }, { key: 'is_active', label: 'Active' }]}
          fields={[{ key: 'course_id', label: 'Programme', type: 'select', required: true, from: { table: 'courses', label: 'name' } },
            { key: 'name', label: 'Level name', required: true, hint: 'e.g. Beginner, Elementary, Intermediate' },
            { key: 'rank', label: 'Order (1 = lowest)', type: 'number', step: '1', required: true, defaultValue: 1 },
            { key: 'monthly_fee', label: 'Standard monthly fee (RM)', type: 'number', required: true, defaultValue: 0 },
            { key: 'description', label: 'What learners can do at this level', type: 'textarea' }, { key: 'is_active', label: 'Active', type: 'checkbox' }]} />
      )}
      {tab === 'places' && (
        <div className="space-y-8">
          <ResourcePage embedded table="centres" title="Learning centres" order="name" ascending
            cols={[{ key: 'name', label: 'Centre' }, { key: 'address', label: 'Address' }, { key: 'timezone', label: 'Time zone' }, { key: 'is_active', label: 'Active' }]}
            fields={[{ key: 'name', label: 'Name', required: true }, { key: 'address', label: 'Address', type: 'textarea' },
              { key: 'timezone', label: 'Time zone', defaultValue: 'Asia/Kuala_Lumpur' }, { key: 'is_active', label: 'Active', type: 'checkbox' }]} />
          <ResourcePage embedded table="classrooms" title="Rooms" select="*, centres(name)" order="name" ascending
            cols={[{ key: 'name', label: 'Room' }, { key: 'centres.name', label: 'Centre' }, { key: 'capacity', label: 'Capacity' }, { key: 'is_active', label: 'Active' }]}
            fields={[{ key: 'name', label: 'Name', required: true }, { key: 'centre_id', label: 'Centre', type: 'select', from: { table: 'centres', label: 'name' } },
              { key: 'capacity', label: 'Capacity', type: 'number', step: '1', required: true }, { key: 'is_active', label: 'Active', type: 'checkbox' }]} />
        </div>
      )}
    </div>
  )
}
