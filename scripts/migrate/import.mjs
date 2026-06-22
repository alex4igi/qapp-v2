// Migrare v1 (PocketBase) -> v2 (Supabase).
//   node scripts/migrate/import.mjs --sample   # subset coerent (verificare în browser)
//   node scripts/migrate/import.mjs            # import complet (tot istoricul)
import { sb, uuid, load, pbDate, pbTimestamp, pbFirst, pbArr, nz, bool, upsertAll } from './lib.mjs'
import { backfillCursuriTeacheri } from './backfill-cursuri-teacheri.mjs'

const SAMPLE = process.argv.includes('--sample')
const WIPE = process.argv.includes('--wipe')
const SAMPLE_CLIENTS = 40

// Curăță datele de domeniu (TEST + import anterior). FK-urile sunt ON DELETE SET NULL,
// deci ordinea nu produce violări; păstrăm totuși copil->părinte pentru tabelele cu FK NOT NULL.
async function wipe() {
  const order = [
    'programari_leads', 'prezente', 'incasari', 'enrollments', 'vouchere',
    'feedback', 'evaluari', 'reinscrieri', 'salarii_teacher', 'salariu_teacher',
    'leads', 'cursuri', 'clienti', 'familii', 'sali', 'sezoane', 'teacheri', 'locatii',
  ]
  for (const t of order) {
    const { error, count } = await sb.from(t).delete({ count: 'exact' }).not('id', 'is', null)
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) continue
      console.warn(`  wipe ${t}: ⚠️ ${error.message}`)
    } else console.log(`  wipe ${t}: ${count ?? 0} șterse`)
  }
}

// ---------- mapări enum v1 -> v2 ----------
const LEAD_STATUS = { 'Convertit': 'convertit', 'Programat': 'programat', 'De revenit': 'contactat', 'Nu doreste': 'pierdut' }
const LEAD_SUBSTATUS = { 'De revenit': 'de_revenit' }
const LEAD_INTERES = { 'Dans': 'Street Dance', 'Gimnastica': 'Acrobatică', 'K-Pop': 'K-pop', 'Contemporan': 'Nu știu încă' }

async function main() {
  console.log(SAMPLE ? '=== MIGRARE: mod SAMPLE (subset) ===' : '=== MIGRARE: import COMPLET ===')
  if (WIPE) { console.log('--- WIPE date existente ---'); await wipe() }

  // ---------- citire dump-uri ----------
  const v = {
    sez: load('Sezoane'), loc: load('Locatii'), sali: load('Sali'), teach: load('Teacheri'),
    fam: load('Familii'), cli: load('Clienti'), curs: load('Cursuri'), vou: load('Vouchere'),
    enr: load('Enrollments'), inc: load('Incasari'), prez: load('Prezente'),
    leads: load('Leads'), prog: load('Programari_leads'),
  }

  // ---------- sezon după dată ----------
  const seasons = v.sez.map((s) => ({ pb: s.id, start: pbDate(s.Data_incepere), end: pbDate(s.Data_final) }))
  const seasonFor = (d) => {
    const x = pbDate(d); if (!x) return null
    const s = seasons.find((s) => x >= s.start && x <= s.end)
    return s ? uuid('Sezoane', s.pb) : null
  }

  // FK sigur: doar dacă ținta e printre id-urile importate, altfel null (FK-uri orfane în v1)
  const TS_FALLBACK = '2024-01-01T00:00:00.000Z'
  const ts = (v) => pbTimestamp(v) || TS_FALLBACK
  const ref = (table, pbId, set) => (pbId && set.has(pbId) ? uuid(table, pbId) : null)
  const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null }
  // v1 datează înrolarea „Per luna" recurentă la ULTIMA zi a lunii X = abonamentul lunii X+1.
  // v2 citește luna brută din data_incepere (zi 1 = luna facturată). Normalizăm: ultima-zi → zi 1 a lunii următoare.
  // Rândurile mid-month (prorata de început) rămân (sunt luna proprie). Vezi [[project-bug-luna-inrolari]].
  const billingStart = (iso, tip) => {
    if (tip !== 'Per luna' || !iso) return iso
    const [y, m, d] = iso.split('-').map(Number)
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    if (d !== lastDay) return iso
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
    return `${ny}-${String(nm).padStart(2, '0')}-01`
  }
  const sezSet = new Set(v.sez.map((x) => x.id))
  const locSet = new Set(v.loc.map((x) => x.id))
  const salaSet = new Set(v.sali.map((x) => x.id))
  const teachSet = new Set(v.teach.map((x) => x.id))
  const cursSet = new Set(v.curs.map((x) => x.id))
  const vouSet = new Set(v.vou.map((x) => x.id))
  const leadSet = new Set(v.leads.map((x) => x.id))

  // ---------- 1. Sezoane ----------
  await upsertAll('sezoane', v.sez.map((s) => ({
    id: uuid('Sezoane', s.id), numele_sezonului: s.Numele_sezonului,
    data_incepere: pbDate(s.Data_incepere), data_final: pbDate(s.Data_final),
    activ: pbDate(s.Data_final) >= '2026-06-04' && pbDate(s.Data_incepere) <= '2026-06-04',
    created: ts(s.created), updated: ts(s.updated),
  })))

  // ---------- 2. Locatii ----------
  await upsertAll('locatii', v.loc.map((l) => ({
    id: uuid('Locatii', l.id), nume: l.Nume,
    created: ts(l.created), updated: ts(l.updated),
  })))
  const locByName = {}; v.loc.forEach((l) => { locByName[l.Nume.toLowerCase()] = uuid('Locatii', l.id) })

  // ---------- 3. Sali ----------
  await upsertAll('sali', v.sali.map((s) => ({
    id: uuid('Sali', s.id), nume: s.Nume, capacitate: nz(s.Capacitate),
    locatie: ref('Locatii', s.Locatie, locSet),
    old_loc_id: nz(s.old_loc_id),
    created: ts(s.created), updated: ts(s.updated),
  })))
  const salaLoc = {}; v.sali.forEach((s) => { salaLoc[s.id] = s.Locatie || null })

  // ---------- 4. Teacheri ----------
  await upsertAll('teacheri', v.teach.map((t) => ({
    id: uuid('Teacheri', t.id), nume: t.Nume, prenume: nz(t.Prenume), email: nz(t.Email),
    telefon: nz(t.Telefon), data_nasterii: pbDate(t.Data_nasterii), nivelul: nz(t.Nivelul),
    marime_tricou: nz(pbFirst(t.Marime_tricou)), link_contract: nz(t.Link_contract),
    observatii: nz(t.Observatii), old_teacher_id: nz(t.old_teacher_id),
    created: ts(t.created), updated: ts(t.updated),
  })))

  // ---------- selecție clienți (sample) ----------
  const activeClients = new Set(v.enr.filter((e) => bool(e.Activ) && !bool(e.Reziliat)).map((e) => e.Client))
  let cliRows = v.cli
  if (SAMPLE) {
    // preferă clienți activi CU familie (ca să acoperim criteriul „înrolare cu familia")
    const withFam = v.cli.filter((c) => activeClients.has(c.id) && c.Familia)
    const noFam = v.cli.filter((c) => activeClients.has(c.id) && !c.Familia)
    cliRows = [...withFam, ...noFam].slice(0, SAMPLE_CLIENTS)
  }
  const cliIds = new Set(cliRows.map((c) => c.id))

  // ---------- 5. Familii ----------
  let famRows = v.fam
  if (SAMPLE) {
    const famIds = new Set(cliRows.map((c) => c.Familia).filter(Boolean))
    famRows = v.fam.filter((f) => famIds.has(f.id))
  }
  const famSet = new Set(famRows.map((f) => f.id))
  await upsertAll('familii', famRows.map((f) => ({
    id: uuid('Familii', f.id), nume_familie: f.Nume_familie || f.Nume_reprezentant || 'Familie',
    nume_reprezentant: nz(f.Nume_reprezentant), prenume_reprezentant: nz(f.Prenume_reprezentant),
    email: nz(f.Email), telefon: nz(f.Telefon), telefon_2: nz(f.Telefon_2),
    metoda_comunicare: nz(f.Metoda_comunicare), metoda_plata: nz(f.Metoda_plata),
    observatii: nz(f.Observatii), doreste_sa_apara_in_poze: bool(f.Doreste_sa_apara_in_poze),
    created: ts(f.created), updated: ts(f.updated),
  })))

  // ---------- 6. Clienti ----------
  await upsertAll('clienti', cliRows.map((c) => ({
    id: uuid('Clienti', c.id), nume: c.Nume, prenume: nz(c.Prenume), email: nz(c.Email),
    telefon: nz(c.Telefon), telefonul_2: nz(c.Telefonul_2), data_nasterii: pbDate(c.Data_nasterii),
    sexul: nz(c.Sexul), marime_tricou: nz(pbFirst(c.Marime_tricou)),
    familia: ref('Familii', c.Familia, famSet),
    status: activeClients.has(c.id) ? 'Activ' : 'Inactiv',
    link_contract: nz(c.Link_contract), old_user_id: nz(c.old_user_id),
    created: ts(c.created), updated: ts(c.updated),
  })))
  const cliSet = cliIds

  // ---------- 7. Cursuri (mereu toate) ----------
  await upsertAll('cursuri', v.curs.map((cu) => ({
    id: uuid('Cursuri', cu.id), numele: cu.Numele, stil: nz(cu.Stil), nivelul: nz(cu.Nivelul),
    varsta: nz(cu.Varsta), zile: pbArr(cu.Zile), ora: nz(cu.Ora), durata_cursului: nz(cu.Durata_cursului),
    capacitate_maxima: nz(cu.Capacitate_maxima),
    sala: ref('Sali', cu.Sala, salaSet),
    locatie: cu.Sala && salaLoc[cu.Sala] && locSet.has(salaLoc[cu.Sala]) ? uuid('Locatii', salaLoc[cu.Sala]) : null,
    teacher: ref('Teacheri', cu.Teacher, teachSet),
    sezon: sezSet.has(cu.Sezon) ? uuid('Sezoane', cu.Sezon) : seasonFor(cu.created),
    pret_sedinta: nz(cu.Pret_sedinta), pret_lunar: nz(cu.Pret_lunar),
    pret_lunar_promo: nz(cu.Pret_lunar_PROMO), pret_anual: nz(cu.Pret_anual),
    facultativ: bool(cu.Facultativ), one_time: bool(cu.One_time),
    participari_eveniment: bool(cu.Participari_eveniment), suspendat: bool(cu.Suspendat),
    old_sub_id: nz(cu.old_sub_id),
    created: ts(cu.created), updated: ts(cu.updated),
  })))
  const cursSala = {}; v.curs.forEach((cu) => { cursSala[cu.id] = cu.Sala || null })

  // ---------- 8. Vouchere (mereu toate) ----------
  await upsertAll('vouchere', v.vou.map((vo) => ({
    id: uuid('Vouchere', vo.id), cod_voucher: vo.Cod_voucher || 'VCH', tip: nz(vo.Tip),
    valoare: nz(vo.Valoare), numar_utilizari: nz(vo.Numar_utilizari),
    data_inceperii: pbDate(vo.Data_inceperii), data_expirarii: pbDate(vo.Data_expirarii),
    descriere: nz(vo.Descriere), client: ref('Clienti', vo.Client, cliSet),
    curs: ref('Cursuri', vo.Curs, cursSet), tip_enrollment: nz(vo.Tip_enrollment),
    created: ts(vo.created), updated: ts(vo.updated),
  })))

  // ---------- 9. Enrollments ----------
  let enrRows = v.enr
  if (SAMPLE) enrRows = v.enr.filter((e) => cliIds.has(e.Client))
  const enrSet = new Set(enrRows.map((e) => e.id))
  const enrCurs = {}; v.enr.forEach((e) => { enrCurs[e.id] = e.Cursul || null })
  await upsertAll('enrollments', enrRows.map((e) => {
    const di = billingStart(pbDate(e.Data_incepere), e.Tip_Plata)
    return ({
    id: uuid('Enrollments', e.id), client: ref('Clienti', e.Client, cliSet),
    cursul: ref('Cursuri', e.Cursul, cursSet),
    sezon_id: seasonFor(di),
    data_incepere: di, data_final: pbDate(e.Data_final),
    activ: bool(e.Activ), reziliat: bool(e.Reziliat), retrogradat: bool(e.Retrogradat),
    tip_plata: nz(e.Tip_Plata), suma_baza: nz(e.Suma), suma: nz(e.Suma),
    foloseste_pret_promo: bool(e.Foloseste_pret_PROMO),
    voucher: ref('Vouchere', e.Voucher, vouSet),
    old_user_sub_id: nz(e.old_user_sub_id),
    created: ts(e.created), updated: ts(e.updated),
  }) }), { batch: 1000 })

  // ---------- 10. Incasari ----------
  let incRows = v.inc
  if (SAMPLE) incRows = v.inc.filter((i) => cliIds.has(i.Client))
  const incCategorie = (i) => i.Bilet ? 'Bilet' : i.Articol_inventar ? 'Merch' : i.Inregistrare ? 'Abonament' : 'Taxa'
  const incLocatie = (i) => {
    const curs = i.Inregistrare ? enrCurs[i.Inregistrare] : null
    const sala = curs ? cursSala[curs] : null
    const loc = sala ? salaLoc[sala] : null
    return loc ? uuid('Locatii', loc) : null
  }
  await upsertAll('incasari', incRows.map((i) => ({
    id: uuid('Incasari', i.id), client: ref('Clienti', i.Client, cliSet),
    inregistrare: ref('Enrollments', i.Inregistrare, enrSet),
    data: pbDate(i.Data), suma: nz(i.Suma), metoda: nz(pbFirst(i.Metoda)) || 'Cash',
    categorie: incCategorie(i), locatie: incLocatie(i),
    sezon: seasonFor(i.Data), voucher: ref('Vouchere', i.Voucher, vouSet),
    bucati: nz(i.Bucati), observatii: nz(i.Observatii),
    created: ts(i.created), updated: ts(i.updated),
  })), { batch: 1000 })

  // ---------- 11. Prezente ----------
  let prezRows = v.prez
  if (SAMPLE) prezRows = v.prez.filter((p) => cliIds.has(p.Client))
  await upsertAll('prezente', prezRows.map((p) => ({
    id: uuid('Prezente', p.id), client: ref('Clienti', p.Client, cliSet),
    enrollment: ref('Enrollments', p.Enrollment, enrSet),
    data: pbDate(p.Data), status: nz(p.Status) || 'Prezent',
    created: ts(p.created), updated: ts(p.updated),
  })), { batch: 1000 })

  // ---------- 12. Leads (mereu toate) ----------
  await upsertAll('leads', v.leads.map((l) => ({
    id: uuid('Leads', l.id), nume: l.Nume || 'Lead', email: nz(l.Email), telefon: nz(l.Telefon),
    data_nasterii: pbDate(l.Data_nasterii), sexul: nz(l.Sexul), varsta: int(l.Varsta),
    interes: LEAD_INTERES[l.Interes] || null,
    locatia: l.Locatia && locByName[String(l.Locatia).toLowerCase()] ? locByName[String(l.Locatia).toLowerCase()] : null,
    nume_parinte: nz(l.Nume_parinte),
    status: LEAD_STATUS[l.Status] || 'nou', sub_status: LEAD_SUBSTATUS[l.Status] || null,
    data_followup: pbDate(l.Data_followup),
    id_client: ref('Clienti', l.Id_client, cliSet),
    cod_voucher: nz(l.Cod_voucher), utm_source: nz(l.utm_source), utm_medium: nz(l.utm_medium),
    utm_campaign: nz(l.utm_campaign),
    created: ts(l.created), updated: ts(l.updated),
  })))

  // ---------- 13. Programari_leads ----------
  await upsertAll('programari_leads', v.prog.filter((p) => leadSet.has(p.Lead)).map((p) => ({
    id: uuid('Programari_leads', p.id), lead: uuid('Leads', p.Lead),
    data_programarii: pbDate(p.Data_programarii),
    locatie: ref('Locatii', p.Locatie, locSet),
    cursul_programat: ref('Cursuri', p.Cursul_programat, cursSet),
    interes: nz(p.Interes), prezenta: 'programat', observatii: nz(p.Observatii),
    created: ts(p.created), updated: ts(p.updated),
  })))

  // ---------- post-import: M:N profesor↔curs (din titular legacy) ----------
  // wipe() șterge `cursuri` → cascade golește cursuri_teacheri. Reconstruim M:N
  // ca profesorii logați să-și vadă grupele. Idempotent. Vezi [[project-reimport-luni-beta]].
  const { courses } = await backfillCursuriTeacheri()
  console.log(`  backfill cursuri_teacheri: ${courses} legături titular`)

  console.log('\n✅ Gata.')
}

main().catch((e) => { console.error(e); process.exit(1) })
