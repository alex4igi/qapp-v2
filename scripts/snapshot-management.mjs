// Snapshot statistic pentru proiectul de management al companiei.
// Extrage DOAR citiri (SELECT + RPC) din Supabase și scrie un JSON cu tot ce
// poate fi numărat: clienți, înrolări, încasări, prezențe, leads, restanțe etc.
//
// Rulare:  node scripts/snapshot-management.mjs > snapshot.json
// Apoi cere-i lui Claude să formateze raportul MD pe baza JSON-ului
// (model: „Management/quasar-dance-snapshot-management-2026-07-17.md").

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const today = new Date().toISOString().slice(0, 10)
const out = { generated_at: new Date().toISOString(), errors: [] }
const err = (sec, e) => out.errors.push(`${sec}: ${e.message || e}`)

async function count(table, mod) {
  let q = db.from(table).select('*', { count: 'exact', head: true })
  if (mod) q = mod(q)
  const { count: c, error } = await q
  if (error) throw error
  return c
}

async function fetchAll(table, cols, mod) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999)
    if (mod) q = mod(q)
    const { data, error } = await q
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

const tally = (rows, key) => {
  const m = {}
  for (const r of rows) {
    const k = r[key] ?? '(null)'
    m[k] = (m[k] || 0) + 1
  }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]))
}
const sumBy = (rows, key, val) => {
  const m = {}
  for (const r of rows) {
    const k = r[key] ?? '(null)'
    m[k] = (m[k] || 0) + (Number(r[val]) || 0)
  }
  return Object.fromEntries(
    Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)]),
  )
}

async function main() {
  const sezoane = await fetchAll('sezoane', 'id, numele_sezonului, data_incepere, data_final, stare, activ, tip')
  out.sezoane = sezoane.map(({ id, ...r }) => r)
  const sezName = Object.fromEntries(sezoane.map((s) => [s.id, s.numele_sezonului]))

  const locatii = await fetchAll('locatii', 'id, nume')
  const locName = Object.fromEntries(locatii.map((l) => [l.id, l.nume]))
  out.locatii = locatii.map((l) => l.nume)

  // Clienți
  try {
    const clienti = await fetchAll('clienti', 'id, status, data_nasterii, opt_out_marketing, familia, telefon')
    const now = new Date()
    const ages = { '<7': 0, '7-10': 0, '11-14': 0, '15-18': 0, '19-24': 0, '25+': 0, necunoscut: 0 }
    for (const c of clienti) {
      if (!c.data_nasterii) { ages.necunoscut++; continue }
      const a = (now - new Date(c.data_nasterii)) / 3.15576e10
      if (a < 7) ages['<7']++
      else if (a < 11) ages['7-10']++
      else if (a < 15) ages['11-14']++
      else if (a < 19) ages['15-18']++
      else if (a < 25) ages['19-24']++
      else ages['25+']++
    }
    out.clienti = {
      total: clienti.length,
      pe_status: tally(clienti, 'status'),
      pe_varsta: ages,
      cu_telefon: clienti.filter((c) => c.telefon).length,
      opt_out_marketing: clienti.filter((c) => c.opt_out_marketing).length,
    }
  } catch (e) { err('clienti', e) }

  try { out.familii_total = await count('familii') } catch (e) { err('familii', e) }
  try {
    const pa = await fetchAll('portal_accounts', 'id, status, last_login_at')
    out.portal = { conturi: pa.length, pe_status: tally(pa, 'status'), au_intrat_vreodata: pa.filter((p) => p.last_login_at).length }
  } catch (e) { err('portal_accounts', e) }
  try {
    const t = await fetchAll('teacheri', 'id, arhivat')
    out.teacheri = { total: t.length, activi: t.filter((x) => !x.arhivat).length }
  } catch (e) { err('teacheri', e) }

  // Cursuri per sezon
  try {
    const cursuri = await fetchAll('cursuri', 'id, sezon, locatie, facultativ, suspendat, capacitate_maxima')
    const byS = {}
    for (const c of cursuri) {
      const s = sezName[c.sezon] || '(fara sezon)'
      byS[s] = byS[s] || { total: 0, active: 0, facultative: 0, capacitate: 0 }
      byS[s].total++
      if (!c.suspendat) byS[s].active++
      if (c.facultativ) byS[s].facultative++
      byS[s].capacitate += Number(c.capacitate_maxima) || 0
    }
    out.cursuri = {
      total_toate_sezoanele: cursuri.length,
      pe_sezon: byS,
      pe_locatie: tally(cursuri.map((c) => ({ l: locName[c.locatie] || '(null)' })), 'l'),
    }
  } catch (e) { err('cursuri', e) }

  // Înrolări — global + detaliu per sezon
  try {
    const enr = await fetchAll('enrollments', 'client, activ, reziliat, sezon_id, tip_plata, este_reinscriere')
    const byS = {}
    for (const e2 of enr) {
      const s = sezName[e2.sezon_id] || '(fara sezon)'
      byS[s] = byS[s] || { total: 0, active_flag: 0, reziliate: 0, reinscrieri: 0, _clienti: new Set(), pe_tip_plata: {} }
      byS[s].total++
      if (e2.activ && !e2.reziliat) byS[s].active_flag++
      if (e2.reziliat) byS[s].reziliate++
      if (e2.este_reinscriere) byS[s].reinscrieri++
      if (e2.client) byS[s]._clienti.add(e2.client)
      byS[s].pe_tip_plata[e2.tip_plata] = (byS[s].pe_tip_plata[e2.tip_plata] || 0) + 1
    }
    for (const v of Object.values(byS)) {
      v.clienti_unici = v._clienti.size
      delete v._clienti
    }
    out.inrolari = { total: enr.length, pe_sezon: byS }
  } catch (e) { err('enrollments', e) }

  // Prezențe — total, pe status, per sezon (pe interval de date)
  try {
    const total = await count('prezente')
    const prez = await count('prezente', (q) => q.eq('status', 'Prezent'))
    const abs = await count('prezente', (q) => q.eq('status', 'Absent'))
    const perSezon = {}
    for (const s of sezoane) {
      if (!s.data_incepere || !s.data_final) continue
      const t = await count('prezente', (q) => q.gte('data', s.data_incepere).lte('data', s.data_final))
      const p = await count('prezente', (q) => q.eq('status', 'Prezent').gte('data', s.data_incepere).lte('data', s.data_final))
      perSezon[s.numele_sezonului] = { total: t, prezent: p, absent: t - p }
    }
    out.prezente = { total, prezent: prez, absent: abs, alte: total - prez - abs, pe_sezon: perSezon }
  } catch (e) { err('prezente', e) }

  // Încasări — global + detaliu per sezon + lunar
  try {
    const inc = await fetchAll('incasari', 'suma, data, categorie, metoda, sezon, locatie, client')
    const luni = {}
    for (const r of inc) {
      if (!r.data) continue
      const m = r.data.slice(0, 7)
      luni[m] = (luni[m] || 0) + (Number(r.suma) || 0)
    }
    const byS = {}
    for (const s of sezoane) {
      const rows = inc.filter((r) => r.sezon && sezName[r.sezon] === s.numele_sezonului)
      byS[s.numele_sezonului] = {
        tranzactii: rows.length,
        total: Math.round(rows.reduce((a, r) => a + (Number(r.suma) || 0), 0)),
        clienti_unici_platitori: new Set(rows.map((r) => r.client).filter(Boolean)).size,
        pe_categorie: sumBy(rows, 'categorie', 'suma'),
        pe_metoda: sumBy(rows, 'metoda', 'suma'),
        pe_locatie: sumBy(rows.map((r) => ({ l: locName[r.locatie] || '(fara locatie)', suma: r.suma })), 'l', 'suma'),
      }
    }
    out.incasari = {
      numar_total_tranzactii: inc.length,
      total_all_time: Math.round(inc.reduce((a, r) => a + (Number(r.suma) || 0), 0)),
      pe_sezon: byS,
      pe_luna_ultimele_13: Object.fromEntries(
        Object.entries(luni).sort().slice(-13).map(([k, v]) => [k, Math.round(v)]),
      ),
    }
  } catch (e) { err('incasari', e) }

  // Cheltuieli (modul slab folosit — vezi limitările din raport)
  try {
    const ch = await fetchAll('cheltuieli', 'valoare, data, categorie, achitat')
    out.cheltuieli = {
      numar: ch.length,
      total: Math.round(ch.reduce((a, r) => a + (Number(r.valoare) || 0), 0)),
      pe_categorie: sumBy(ch, 'categorie', 'valoare'),
    }
  } catch (e) { err('cheltuieli', e) }

  // RPC-uri agregate
  try { out.restante = (await db.rpc('get_restante_totale', {})).data?.[0] || null } catch (e) { err('get_restante_totale', e) }
  try { out.clienti_activi_pe_locatie = (await db.rpc('get_clienti_activi')).data } catch (e) { err('get_clienti_activi', e) }
  try { out.retentie_membri = (await db.rpc('get_retentie_membri', {})).data?.[0] || null } catch (e) { err('get_retentie_membri', e) }
  try {
    const g = (await db.rpc('get_grad_ocupare', {})).data || []
    out.ocupare_sezon_activ = {
      grupe_raportate: g.length,
      medie_procent: g.length ? Math.round(g.reduce((a, r) => a + (Number(r.procent) || 0), 0) / g.length) : null,
      capacitate_totala: g.reduce((a, r) => a + (Number(r.capacitate) || 0), 0),
      activi_totali: g.reduce((a, r) => a + (Number(r.activi) || 0), 0),
    }
  } catch (e) { err('get_grad_ocupare', e) }

  // Leads — bază + funnel pe ultimele ~6 luni
  try {
    const leads = await fetchAll('leads', 'id, status, deja_client, data_conversie')
    out.leads = {
      total: leads.length,
      pe_status: tally(leads, 'status'),
      convertiti_total: leads.filter((l) => l.data_conversie).length,
    }
    const from = new Date(Date.now() - 183 * 864e5).toISOString().slice(0, 10)
    const f = (await db.rpc('get_lead_funnel', { p_from: from, p_to: today })).data || []
    const agg = { leads_total: 0, contactati: 0, proba: 0, prezenti: 0, convertiti: 0, nu_a_venit: 0, pierdut: 0 }
    for (const r of f) for (const k of Object.keys(agg)) agg[k] += Number(r[k]) || 0
    out.lead_funnel_ultimele_6_luni = {
      interval: [from, today],
      total: agg,
      pe_sursa: f.map((r) => ({ sursa: r.sursa_nume, leads: r.leads_total, convertiti: r.convertiti })).filter((r) => r.leads > 0),
    }
  } catch (e) { err('leads', e) }

  // Contoare operaționale diverse
  try {
    const s = await fetchAll('sms_logs', 'status, tip')
    out.sms = { total: s.length, pe_status: tally(s, 'status'), pe_tip: tally(s, 'tip') }
  } catch (e) { err('sms_logs', e) }
  try {
    const f = await fetchAll('facturi_fgo', 'status, suma')
    out.facturi_fgo = { total: f.length, pe_status: tally(f, 'status'), valoare_totala: Math.round(f.reduce((a, r) => a + (Number(r.suma) || 0), 0)) }
  } catch (e) { err('facturi_fgo', e) }
  try {
    const n = await fetchAll('netopia_orders', 'status, amount, order_type')
    const paid = n.filter((r) => ['paid', 'confirmed'].includes(r.status))
    out.netopia = { total_comenzi: n.length, pe_status: tally(n, 'status'), pe_tip: tally(n, 'order_type'), valoare_platita: Math.round(paid.reduce((a, r) => a + (Number(r.amount) || 0), 0)) }
  } catch (e) { err('netopia_orders', e) }
  try {
    const b = await fetchAll('bilete', 'status, pret')
    out.bilete = { total: b.length, pe_status: tally(b, 'status'), valoare_totala: Math.round(b.reduce((a, r) => a + (Number(r.pret) || 0), 0)) }
  } catch (e) { err('bilete', e) }
  try {
    const i = await fetchAll('inchirieri', 'pret, status_plata')
    out.inchirieri = { total: i.length, pe_status_plata: tally(i, 'status_plata'), valoare_totala: Math.round(i.reduce((a, r) => a + (Number(r.pret) || 0), 0)) }
  } catch (e) { err('inchirieri', e) }
  try {
    const c = await fetchAll('contracte', 'status')
    out.contracte = { total: c.length, pe_status: tally(c, 'status') }
  } catch (e) { err('contracte', e) }
  try {
    const sal = await fetchAll('salarii_teacher', 'anul, total, status')
    out.salarii_teacher = { inregistrari: sal.length, total_pe_an: sumBy(sal, 'anul', 'total'), pe_status: tally(sal, 'status') }
  } catch (e) { err('salarii_teacher', e) }
  for (const t of ['evaluari', 'spectacole', 'vouchere', 'voucher_redemptions', 'app_feedback', 'staff_pontaj', 'open_rezervari', 'evenimente', 'motivari_absenta']) {
    try { out[`${t}_total`] = await count(t) } catch (e) { err(t, e) }
  }

  console.log(JSON.stringify(out, null, 2))
  if (out.errors.length) console.error('Erori parțiale:', out.errors)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
