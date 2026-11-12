// Demo workflow regression checks. Run: npm run test:demo
// Uses TypeScript transpilation in Node without a browser or Supabase.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const storage = new Map()
global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
global.window = { dispatchEvent() {} }
global.CustomEvent = class { constructor(name) { this.type = name } }
const file = path.resolve(__dirname, '../src/lib/mockData.ts')
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }}).outputText
const m = new Module(file, module)
m.filename = file
m.paths = Module._nodeModulePaths(path.dirname(file))
m._compile(js, file)
const { executeMockRpc: rpc, MockQueryBuilder, writeDemoSession, buildDemoAuth } = m.exports
async function query(table) { const result = await new MockQueryBuilder(table).select('*'); assert.equal(result.error, null); return result.data }
function run(name, args) { const result = rpc(name, args); assert.equal(result.error, null, `${name}: ${result.error?.message}`); return result.data }
;(async () => {
  writeDemoSession(buildDemoAuth('admin'))
  const students = await query('students')
  assert.ok(students.length > 0)
  const teacher = run('booking_teachers')[0]
  assert.ok(teacher)
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const slots = run('available_booking_slots', { p_teacher: teacher.id, p_from: start, p_to: start, p_duration: 60 })
  assert.ok(slots.length > 0, 'booking slots should be available in future')
  run('request_booking', { p_teacher: teacher.id, p_starts_at: slots[0].starts_at, p_duration: 60, p_objective: 'Improve speaking', p_language: 'lang-en' })
  const otherSlots = run('available_booking_slots', { p_teacher: teacher.id, p_from: start, p_to: start, p_duration: 60 })
  assert.ok(!otherSlots.some(x => x.starts_at === slots[0].starts_at), 'booked time should disappear')
  const pay = (await query('payments')).find(x => x.status === 'pending')
  assert.ok(pay, 'seed payment waiting for confirmation')
  const receipt = run('confirm_payment', { p_payment: pay.id })
  assert.ok(receipt.receipt_no)
  const invoices = await query('invoice_overview')
  assert.ok(invoices.find(i => i.id === pay.invoice_id).amount_paid > 0, 'payment should update invoice totals')
  const twice = run('confirm_payment', { p_payment: pay.id })
  assert.equal(twice.receipt_no, receipt.receipt_no, 'confirming twice must not duplicate receipts')
  const reminders = run('run_automation', { p_job: 'class_reminders', p_trigger: 'manual' })
  assert.equal(reminders.simulated, true)
  const sameReminders = run('run_automation', { p_job: 'class_reminders', p_trigger: 'manual' })
  assert.equal(sameReminders.processed, 0, 'reminders should be idempotent')
  const bills = run('run_automation', { p_job: 'monthly_invoices', p_trigger: 'manual' })
  assert.equal(bills.simulated, true)
  const progress = run('run_report', { p_key: 'progress', p_filters: {} })
  assert.ok(progress.length, 'progress report should have demo observations')
  const attendance = run('run_report', { p_key: 'attendance', p_filters: {} })
  assert.ok(attendance.length, 'attendance report should have real rows')
  const audit = await query('audit_logs')
  assert.ok(audit.some(a => a.table_name === 'payments'), 'payment changes recorded in audit')
  const newStudent = students.find(s => s.id === 'stu-aisha')
  const created = run('create_invoice', { p_student: newStudent.id, p_items: [{ kind: 'tuition', description: 'Extra lesson', quantity: 1, unit_price: 75 }], p_due_date: start })
  assert.ok(created.id)
  run('issue_invoice', { p_invoice: created.id })
  const recorded = run('record_payment', { p_invoice: created.id, p_amount: 75, p_method: 'cash', p_paid_on: start })
  assert.ok(recorded.receipt_no)
  const paidInvoice = (await query('invoice_overview')).find(x => x.id === created.id)
  assert.equal(paidInvoice.balance, 0)
  assert.equal(paidInvoice.status, 'paid')
  const salary = (await query('teacher_payouts')).find(x => x.status === 'approved')
  if (salary) {
    const remaining = Number(salary.amount) - Number(salary.amount_paid)
    if (remaining > 0) {
      const salaryPaid = run('record_salary_payment', { p_payout: salary.id, p_amount: remaining, p_paid_on: start, p_method: 'cash' })
      assert.equal(salaryPaid.amount, remaining)
    }
  }
  const teacherPay = run('generate_salary_statements', { p_month: new Date().toISOString().slice(0, 7) + '-01' })
  assert.ok('created' in teacherPay)
  console.log('PASS: demo workflow checks: student records, slots, booking collision, payments, receipt idempotency, reminders, monthly invoices, progress, attendance, audit, salary.')
})().catch(err => { console.error(err); process.exitCode = 1 })
