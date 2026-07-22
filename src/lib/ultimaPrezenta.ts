import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'

// „Ultima prezență la grupa X" minte la graniță de sezon: o grupă se re-creează
// ca rând NOU în `cursuri` pentru fiecare sezon, iar prezențele rămân legate de
// rândul vechi (`prezente → enrollment → cursul`). Cursantul care vine în
// continuare, la clona din sezonul nou, apare pe grupa veche cu data din sezonul
// trecut — sau, pe clona nouă, fără nicio prezență. Măsurat 2026-07-22, la
// trecerea în sezonul „Vara 2026": din 938 de rânduri „foști / de recuperat" pe
// grupele din 2025-2026, 448 (48 de grupe) erau oameni care veneau în continuare.
//
// Clonele NU se pot lega între ele: `cursuri.cursul_original` e NULL pe toate
// cele 233 de rânduri, iar numele se potrivește doar la 6 din 34 de cursuri de
// vară. Deci nu reparăm lanțul, ci întrebăm direct unde a fost văzut cursantul
// cel mai recent în afara grupei curente — același tipar cu coloana `vine_la`
// din `get_absente_risc_teacher` (migrația 20260722190000).

// Fereastra în care „mai vine" e o informație acționabilă — aceeași valoare ca
// `alte_grupe` din get_absente_risc_teacher.
const VINE_LA_DAYS = 45

// Vezi IN_CHUNK din features/dashboard/api/grupa.ts: `.in(...)` cu prea multe
// UUID-uri depășește limita de headers a PostgREST.
const IN_CHUNK = 100

export type VineLa = {
  data: string
  cursId: string
  cursNume: string
  sezonNume: string | null
}

type Row = {
  id: string
  client: string | null
  data: string | null
  enr: {
    cursul: string | null
    curs: {
      numele: string | null
      sez: { numele_sezonului: string | null } | null
    } | null
  } | null
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Pentru fiecare cursant dat, unde a fost prezent cel mai recent ÎN AFARA grupei
// `exceptCursId` — dar numai dacă e mai recent decât ce știe grupa despre el.
// Cheia hărții e `clientId`; lipsa unei chei = n-a fost văzut nicăieri altundeva
// mai recent, deci data grupei e adevărul complet.
export async function fetchVineLaByClient(params: {
  clienti: Array<{ id: string; ultimaPrezenta: string | null }>
  exceptCursId: string
  zile?: number
}): Promise<Map<string, VineLa>> {
  const out = new Map<string, VineLa>()
  if (params.clienti.length === 0) return out

  const since = isoDaysAgo(params.zile ?? VINE_LA_DAYS)
  const ids = params.clienti.map((c) => c.id)

  const rows = (
    await Promise.all(
      chunk(ids, IN_CHUNK).map((ch) =>
        fetchAllRows<Row>(() =>
          supabase
            .from('prezente')
            .select(
              'id, client, data, enr:enrollments!inner(cursul, curs:cursuri!inner(numele, sez:sezoane(numele_sezonului)))',
            )
            .in('client', ch)
            .eq('status', 'Prezent')
            .gte('data', since)
            .order('id'),
        ),
      ),
    )
  ).flat()

  for (const r of rows) {
    if (!r.client || !r.data || !r.enr?.cursul) continue
    if (r.enr.cursul === params.exceptCursId) continue
    const existing = out.get(r.client)
    if (existing && existing.data >= r.data) continue
    out.set(r.client, {
      data: r.data,
      cursId: r.enr.cursul,
      cursNume: r.enr.curs?.numele ?? '—',
      sezonNume: r.enr.curs?.sez?.numele_sezonului ?? null,
    })
  }

  // Păstrăm doar ce e mai NOU decât prezența de pe grupa curentă — altfel n-am
  // spune nimic în plus, doar am zgomotos lista.
  for (const c of params.clienti) {
    const v = out.get(c.id)
    if (v && c.ultimaPrezenta && v.data <= c.ultimaPrezenta) out.delete(c.id)
  }

  return out
}

// Grupa clonată pe sezon nou păstrează numele, deci „vine la S LMi Junior INT"
// pe fișa lui S LMi Junior INT ar suna a bug. Când numele coincide, ce s-a
// schimbat de fapt e sezonul — și asta spunem.
export function vineLaLabel(v: VineLa, cursNumeCurent: string): string {
  if (v.cursNume === cursNumeCurent) {
    return v.sezonNume
      ? `aceeași grupă, sezonul ${v.sezonNume}`
      : 'aceeași grupă, alt sezon'
  }
  return v.sezonNume ? `${v.cursNume} (${v.sezonNume})` : v.cursNume
}
