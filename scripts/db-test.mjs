// Runs the SQL test suite against a throwaway local PostgreSQL database.
//
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
//
// The database named in TEST_DB_NAME (default topmind_test) is dropped and
// recreated, then the Supabase stand-in, every migration, the fixtures and each
// supabase/tests/*.test.sql file are applied. Each test file runs in its own
// transaction and is rolled back, so tests do not affect each other.
// Never point this at a real Supabase project.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const adminUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres'
const dbName = process.env.TEST_DB_NAME ?? 'topmind_test'
const only = process.argv[2]

const read = (p) => readFileSync(join(root, p), 'utf8')
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
const testFiles = readdirSync(join(root, 'supabase/tests')).filter((f) => f.endsWith('.test.sql')).sort()
  .filter((f) => !only || f.includes(only))

async function main() {
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`drop database if exists ${dbName} with (force)`)
  await admin.query(`create database ${dbName}`)
  await admin.end()

  const url = new URL(adminUrl)
  url.pathname = '/' + dbName
  const db = new pg.Client({ connectionString: url.toString() })
  await db.connect()
  let notices = []
  db.on('notice', (n) => notices.push(n.message))

  const setup = ['supabase/tests/supabase_shim.sql', ...migrations.map((m) => 'supabase/migrations/' + m),
    'supabase/tests/helpers.sql', 'supabase/tests/fixtures.sql']
  for (const file of setup) {
    try {
      await db.query(read(file))
    } catch (e) {
      console.error(`Setup failed in ${file}: ${e.message}`)
      process.exit(1)
    }
  }
  console.log(`Applied ${migrations.length} migrations and fixtures to ${dbName}\n`)

  let passed = 0
  let failed = 0
  for (const file of testFiles) {
    notices = []
    let error = null
    try {
      await db.query('begin')
      await db.query(read('supabase/tests/' + file))
    } catch (e) {
      error = e
    } finally {
      await db.query('rollback').catch(() => {})
    }
    const oks = notices.filter((n) => n.startsWith('ok - '))
    passed += oks.length
    if (error) {
      failed++
      console.log(`✗ ${file}: ${oks.length} passed before failure`)
      console.log(`    ${error.message}${error.where ? `\n    at ${error.where.split('\n')[0]}` : ''}`)
    } else {
      console.log(`✓ ${file}: ${oks.length} checks`)
      if (process.env.VERBOSE) oks.forEach((n) => console.log('    ' + n.slice(5)))
    }
  }
  await db.end()
  console.log(`\n${passed} checks passed, ${failed} file(s) failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
