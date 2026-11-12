// Static check of the frontend's database calls against the real schema.
//
//   npm run check:queries        (uses TEST_DATABASE_URL like npm run test:db)
//
// Builds a scratch database from the Supabase stand-in and every migration, then
// scans src/ for:
//   - supabase.from('table').select('...') chains: tables, columns, embedded
//     relationships (PostgREST rules: a relationship must exist and be
//     unambiguous, otherwise a !hint is required), filter and order columns,
//     and keys written by insert / update / upsert (including generated columns);
//   - <ResourcePage table=... select=... order=...> usage;
//   - rpc('fn', { args }) calls: the function exists, an overload accepts exactly
//     those argument names, and the calling role (anon on public pages,
//     authenticated elsewhere) may execute it;
//   - storage buckets and Edge Function names.
// Only literal strings are checked; dynamic queries are counted as skipped.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const adminUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres'
const dbName = process.env.CHECK_DB_NAME ?? 'topmind_check'

// ---------------------------------------------------------------- schema
async function loadSchema() {
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`drop database if exists ${dbName} with (force)`)
  await admin.query(`create database ${dbName}`)
  await admin.end()
  const url = new URL(adminUrl)
  url.pathname = '/' + dbName
  const db = new pg.Client({ connectionString: url.toString() })
  await db.connect()
  db.on('notice', () => {})
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  for (const f of ['supabase/tests/supabase_shim.sql', ...migrations.map((m) => 'supabase/migrations/' + m)]) {
    await db.query(readFileSync(join(root, f), 'utf8'))
  }
  const cols = await db.query(`
    select c.relname as rel, c.relkind as kind, a.attname as col, a.attgenerated <> '' as generated
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and a.attnum > 0 and not a.attisdropped`)
  const fks = await db.query(`
    select c.conname as name, cl.relname as tbl, fcl.relname as ftbl,
      array(select a.attname from unnest(c.conkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.o)::text[] as cols,
      array(select a.attname from unnest(c.confkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.o)::text[] as fcols
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_class fcl on fcl.oid = c.confrelid join pg_namespace fn on fn.oid = fcl.relnamespace
    where c.contype = 'f' and n.nspname = 'public' and fn.nspname = 'public'`)
  const fns = await db.query(`
    select p.proname as name, p.pronargs as nargs, p.pronargdefaults as ndefaults, p.proargnames as argnames,
      p.proargmodes::text[] as modes,
      has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)
  const buckets = await db.query('select id from storage.buckets')
  await db.end()

  const rels = new Map()
  for (const r of cols.rows) {
    if (!rels.has(r.rel)) rels.set(r.rel, { kind: r.kind, cols: new Set(), generated: new Set() })
    rels.get(r.rel).cols.add(r.col)
    if (r.generated) rels.get(r.rel).generated.add(r.col)
  }
  const functions = new Map()
  for (const f of fns.rows) {
    const names = f.argnames ?? []
    const inputs = f.modes ? names.filter((_, i) => ['i', 'b', 'v'].includes(f.modes[i])) : names.slice(0, f.nargs)
    const overload = { inputs, required: inputs.slice(0, f.nargs - f.ndefaults), anon: f.anon, authenticated: f.authenticated }
    functions.set(f.name, [...(functions.get(f.name) ?? []), overload])
  }
  return { rels, fks: fks.rows, functions, buckets: new Set(buckets.rows.map((b) => b.id)) }
}

// ---------------------------------------------------------------- source scanning
function skipString(src, i) {
  const q = src[i]
  i++
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') { i += 2; continue }
    if (q === '`' && c === '$' && src[i + 1] === '{') { i = matchClose(src, i + 1) + 1; continue }
    if (c === q) return i + 1
    i++
  }
  return i
}
// Index of the bracket closing the one at src[i].
function matchClose(src, i) {
  let depth = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i); continue }
    if (c === '/' && src[i + 1] === '/') { const n = src.indexOf('\n', i); if (n < 0) return -1; i = n; continue }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) { depth--; if (depth === 0) return i }
    i++
  }
  return -1
}
// Splits on commas that are not nested in brackets or strings.
function splitTop(s) {
  const out = []
  let depth = 0, start = 0, i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '"' || c === "'" || c === '`') { i = skipString(s, i); continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1 }
    i++
  }
  out.push(s.slice(start))
  return out.map((x) => x.trim()).filter(Boolean)
}
// A plain string literal (no template expressions), or null.
function literal(text) {
  const t = text.trim()
  const m = t.match(/^(['"`])([\s\S]*)\1$/)
  if (!m || (m[1] === '`' && m[2].includes('${'))) return null
  return m[2]
}
function objectKeys(text) {
  const t = text.trim()
  if (!t.startsWith('{')) return null
  return splitTop(t.slice(1, t.lastIndexOf('}'))).map((p) => {
    if (p.startsWith('...')) return null
    const m = p.match(/^(['"]?)([A-Za-z_$][\w$]*)\1\s*(?::|$)/)
    return m ? m[2] : null
  }).filter(Boolean)
}
// Method calls chained after position i: [{ name, args: [text], at }].
function chainAfter(src, i) {
  const calls = []
  for (;;) {
    const m = /^\s*\.\s*([A-Za-z_$][\w$]*)\s*(\(|<)/.exec(src.slice(i, i + 200))
    if (!m) return calls
    let p = i + m[0].length - 1
    if (src[p] === '<') { const gt = src.indexOf('(', p); p = gt }
    const end = matchClose(src, p)
    if (end < 0) return calls
    calls.push({ name: m[1], args: splitTop(src.slice(p + 1, end)), at: i })
    i = end + 1
  }
}

// ---------------------------------------------------------------- select parsing
function parseSelect(s) {
  return splitTop(s.replace(/\s+/g, ' ')).map((raw) => {
    let x = raw.replace(/^\.\.\./, '').trim()
    let alias = null
    const am = x.match(/^([A-Za-z_][\w]*)\s*:(?!:)\s*(.*)$/)
    if (am) { alias = am[1]; x = am[2] }
    const paren = x.indexOf('(')
    if (paren >= 0 && !/^[\w]+\.\w+\(\)$/.test(x)) {
      const [target, ...hints] = x.slice(0, paren).trim().split('!').map((h) => h.trim())
      return { kind: 'embed', alias, target, hints: hints.filter((h) => h && h !== 'inner' && h !== 'left'), inner: parseSelect(x.slice(paren + 1, x.lastIndexOf(')'))) }
    }
    const name = x.replace(/::\w+(\[\])?$/, '').replace(/->>?.*$/, '').replace(/\.\w+\(\)$/, '').trim()
    return { kind: 'col', alias, name }
  })
}

// ---------------------------------------------------------------- checks
const problems = []
const stats = { queries: 0, dynamic: 0, rpcs: 0, storage: 0, functions: 0 }
let schema

function columnProblem(table, col, where, what = 'column') {
  const rel = schema.rels.get(table)
  if (!rel || col === '*' || rel.cols.has(col)) return
  problems.push(`${where}  ${table}: ${what} "${col}" does not exist`)
}

// PostgREST embedding: target is a table (or an FK column of the base table);
// a hint may name the constraint or an FK column. Returns the embedded table.
function resolveEmbed(base, e, where) {
  if (schema.rels.get(base)?.kind === 'v') return null // relationships of views are inferred from base tables; not checked
  let cands = []
  if (schema.rels.has(e.target)) {
    cands = [
      ...schema.fks.filter((f) => f.tbl === base && f.ftbl === e.target).map((f) => ({ f, dir: 'm2o', table: e.target })),
      ...schema.fks.filter((f) => f.ftbl === base && f.tbl === e.target && !(f.tbl === base)).map((f) => ({ f, dir: 'o2m', table: e.target })),
    ]
  } else {
    cands = schema.fks.filter((f) => f.tbl === base && f.cols.length === 1 && f.cols[0] === e.target).map((f) => ({ f, dir: 'm2o', table: f.ftbl }))
    if (!cands.length) { problems.push(`${where}  ${base}: "${e.target}" is not a table or foreign-key column`); return null }
  }
  for (const h of e.hints) {
    cands = cands.filter(({ f }) => f.name === h || f.cols.includes(h) || f.fcols.includes(h))
  }
  if (!cands.length) {
    problems.push(`${where}  ${base} -> ${e.target}${e.hints.map((h) => '!' + h).join('')}: no relationship found`)
    return null
  }
  if (cands.length > 1) {
    problems.push(`${where}  ${base} -> ${e.target}: ambiguous (${cands.map(({ f }) => f.name).join(', ')}); add !constraint_name`)
    return null
  }
  return cands[0].table
}

// Returns a map of embed alias/name -> table for filter checks.
function checkSelect(table, items, where) {
  const embeds = new Map()
  for (const it of items) {
    if (it.kind === 'col') {
      if (it.name === 'count' || it.name === '*') continue
      columnProblem(table, it.name, where)
    } else {
      const target = resolveEmbed(table, it, where)
      if (target) {
        embeds.set(it.alias ?? it.target, target)
        checkSelect(target, it.inner, where)
      }
    }
  }
  return embeds
}

const FILTERS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'overlaps', 'not', 'order', 'filter', 'textSearch'])

function checkQuery(table, calls, where) {
  if (!schema.rels.has(table)) { problems.push(`${where}  table or view "${table}" does not exist`); return }
  let embeds = new Map()
  for (const c of calls) {
    if (c.name === 'select' && c.args[0]) {
      const s = literal(c.args[0])
      if (s === null) { stats.dynamic++; continue }
      embeds = new Map([...embeds, ...checkSelect(table, parseSelect(s), where)])
    }
  }
  for (const c of calls) {
    if (FILTERS.has(c.name) && c.args[0]) {
      if (c.name === 'order' && /referencedTable|foreignTable/.test(c.args[1] ?? '')) continue
      const col = literal(c.args[0])
      if (col === null) continue
      const base = col.replace(/->>?.*$/, '')
      if (base.includes('.')) {
        const [emb, inner] = base.split('.')
        if (embeds.has(emb)) columnProblem(embeds.get(emb), inner, where)
        else problems.push(`${where}  ${table}: filter "${col}" refers to "${emb}", which is not embedded in the select`)
      } else columnProblem(table, base, where)
    }
    if (['insert', 'update', 'upsert'].includes(c.name) && c.args[0]) {
      let arg = c.args[0].trim()
      if (arg.startsWith('[')) arg = splitTop(arg.slice(1, arg.lastIndexOf(']')))[0] ?? ''
      const keys = objectKeys(arg)
      if (!keys) { stats.dynamic++; continue }
      for (const k of keys) {
        columnProblem(table, k, where)
        if (schema.rels.get(table)?.generated.has(k)) problems.push(`${where}  ${table}: "${k}" is a generated column and cannot be written`)
      }
      if (c.name === 'upsert' && c.args[1]) {
        const oc = c.args[1].match(/onConflict\s*:\s*(['"])([^'"]+)\1/)
        if (oc) oc[2].split(',').forEach((k) => columnProblem(table, k.trim(), where))
      }
    }
  }
}

function checkRpc(name, argsText, where, role) {
  const overloads = schema.functions.get(name)
  if (!overloads) { problems.push(`${where}  rpc "${name}" does not exist`); return }
  let keys = []
  if (argsText !== undefined) {
    keys = objectKeys(argsText)
    if (!keys) { stats.dynamic++; return }
  }
  const fits = overloads.filter((o) => keys.every((k) => o.inputs.includes(k)) && o.required.every((r) => keys.includes(r)))
  if (!fits.length) {
    const sig = overloads.map((o) => `(${o.inputs.map((n) => (o.required.includes(n) ? n : n + '?')).join(', ')})`).join(' or ')
    problems.push(`${where}  rpc "${name}" called with {${keys.join(', ')}} but takes ${sig}`)
    return
  }
  if (!fits.some((o) => o[role])) problems.push(`${where}  rpc "${name}" is not executable by the ${role} role`)
}

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

async function main() {
  schema = await loadSchema()
  const fnDirs = new Set(readdirSync(join(root, 'supabase/functions')).filter((d) => existsSync(join(root, 'supabase/functions', d, 'index.ts'))))
  for (const file of files(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8')
    const rel = relative(root, file).replace(/\\/g, '/')
    const role = /^src\/pages\/public\/|^src\/lib\/(settings|catalog)\./.test(rel) ? 'anon' : 'authenticated'
    const lineOf = (i) => src.slice(0, i).split('\n').length
    const at = (i) => `${rel}:${lineOf(i)}`

    for (const m of src.matchAll(/(\w+)?\.from\(\s*(['"])([a-z0-9_-]+)\2\s*\)/g)) {
      if (m[1] === 'storage') {
        stats.storage++
        if (!schema.buckets.has(m[3])) problems.push(`${at(m.index)}  storage bucket "${m[3]}" does not exist`)
        continue
      }
      stats.queries++
      checkQuery(m[3], chainAfter(src, m.index + m[0].length), at(m.index))
    }
    for (const m of src.matchAll(/\.from\(\s*[^'"\s)][^)]*\)/g)) if (!/^\.from\(\s*(new |\[)/.test(m[0])) stats.dynamic++

    for (const m of src.matchAll(/\brpc(?:<[^(]*?>)?\(\s*(['"])([a-z0-9_]+)\1\s*(,)?/g)) {
      stats.rpcs++
      const open = m.index + m[0].length - (m[3] ? 1 : 0) - 1
      let argsText
      if (m[3]) {
        const callOpen = src.indexOf('(', m.index)
        const end = matchClose(src, callOpen)
        argsText = splitTop(src.slice(callOpen + 1, end))[1]
      }
      void open
      checkRpc(m[2], argsText, at(m.index), role)
    }

    for (const m of src.matchAll(/\b(?:openPrivateFile|uploadWithProgress)\(\s*(['"])([a-z0-9_-]+)\1/g)) {
      stats.storage++
      if (!schema.buckets.has(m[2])) problems.push(`${at(m.index)}  storage bucket "${m[2]}" does not exist`)
    }
    for (const m of src.matchAll(/\bcallFunction(?:<[^(]*?>)?\(\s*(['"])([a-z0-9_-]+)\1/g)) {
      stats.functions++
      if (!fnDirs.has(m[2])) problems.push(`${at(m.index)}  Edge Function "${m[2]}" does not exist in supabase/functions`)
    }

    // Generic resource pages: table, select and order props, plus field and column keys.
    const parts = src.split('<ResourcePage').slice(1)
    let offset = src.indexOf('<ResourcePage')
    for (const part of parts) {
      const where = at(offset)
      const table = part.match(/\btable="([a-z_]+)"/)?.[1]
      if (table) {
        stats.queries++
        const select = part.match(/\bselect="([^"]+)"/)?.[1] ?? '*'
        if (!schema.rels.has(table)) problems.push(`${where}  table "${table}" does not exist`)
        else {
          checkSelect(table, parseSelect(select), where)
          columnProblem(table, part.match(/\border="([a-z_]+)"/)?.[1] ?? 'created_at', where, 'order column')
          const cut = part.search(/\n\s*<\/|\n\s*<ResourcePage/)
          const body = cut > 0 ? part.slice(0, cut) : part
          for (const k of body.matchAll(/\bkey:\s*'([a-z_]+)'/g)) columnProblem(table, k[1], where, 'field')
          for (const f of body.matchAll(/from:\s*\{\s*table:\s*'([a-z_]+)',\s*label:\s*'([a-z_|]+)'/g)) {
            if (!schema.rels.has(f[1])) problems.push(`${where}  lookup table "${f[1]}" does not exist`)
            else f[2].split('|').forEach((c) => columnProblem(f[1], c, where, 'lookup label'))
          }
        }
      }
      offset = src.indexOf('<ResourcePage', offset + 1)
    }
  }

  for (const p of problems) console.log('✗ ' + p)
  console.log(`\nChecked ${stats.queries} table queries, ${stats.rpcs} RPC calls, ${stats.storage} storage calls and ${stats.functions} Edge Function calls `
    + `(${stats.dynamic} dynamic parts skipped): ${problems.length ? problems.length + ' problem(s)' : 'no problems'}`)
  process.exit(problems.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
