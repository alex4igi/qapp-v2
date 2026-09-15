import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, DataTable, TextInput, type Column } from '@/components/ui'
import type { StartSezonReinscriereRow } from '../api'
import { FilterChips, SplitBar, type ChipOption } from './Filtre'
import { Section } from './Section'

type Stare = 'lipsa' | 'ok' | 'toate'

// Cât de sigură e legătura dintre rândul din Excel și fișa din CRM. Se arată doar
// când NU e potrivire exactă — altfel ar fi o coloană de „exact" pe 235 de rânduri.
const POTRIVIRE: Record<string, { text: string; titlu: string }> = {
  fuzzy: { text: 'al doilea prenume', titlu: 'Excelul scrie „Nume Prenume", fișa are și al doilea prenume' },
  aprox: { text: 'ortografie', titlu: 'Numele e scris diferit în Excel față de fișă' },
  promo: { text: 'legat prin promo', titlu: 'Legat prin steagul de preț promo din aplicație, nu prin nume' },
  ambiguu: { text: 'ambiguu', titlu: 'Există mai multe fișe care s-ar potrivi — verifică manual' },
}

// Registrele scriu „Nume Prenume", fișa „Prenume Nume" — inversarea nu e o diferență.
// Comparăm cuvintele, fără ordine și fără diacritice, ca să nu apară o linie de
// „în registru: …" sub fiecare rând din 318.
function acelasiNume(a: string, b: string): boolean {
  const k = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ')
  return k(a) === k(b)
}

export function ReinscrieriSection({ rows }: { rows: StartSezonReinscriereRow[] }) {
  const navigate = useNavigate()
  const [stare, setStare] = useState<Stare>('lipsa')
  const [locatie, setLocatie] = useState<string>('toate')
  const [q, setQ] = useState('')

  const matchLocatie = (r: StartSezonReinscriereRow, l: string) => l === 'toate' || r.locatie_excel === l
  const matchStare = (r: StartSezonReinscriereRow, s: Stare) =>
    s === 'toate' || (s === 'ok' ? r.inrolat : !r.inrolat)

  // Fiecare grup de pill-uri numără pe subsetul filtrat de CELĂLALT pill — altfel,
  // la schimbarea sălii, bara „intrate/lipsesc" rămâne înghețată pe cifrele globale.
  const rowsPtStare = useMemo(() => rows.filter((r) => matchLocatie(r, locatie)), [rows, locatie])
  const rowsPtLocatii = useMemo(() => rows.filter((r) => matchStare(r, stare)), [rows, stare])

  const inN = rowsPtStare.filter((r) => r.inrolat).length
  const outN = rowsPtStare.length - inN

  const locatii = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rowsPtLocatii) m.set(r.locatie_excel, (m.get(r.locatie_excel) ?? 0) + 1)
    const opts: ChipOption<string>[] = [
      { value: 'toate', label: 'Toate sălile', count: rowsPtLocatii.length },
    ]
    for (const [k, n] of [...m].sort((a, b) => b[1] - a[1])) {
      opts.push({ value: k, label: k, count: n })
    }
    return opts
  }, [rowsPtLocatii])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (!matchStare(r, stare)) return false
      if (!matchLocatie(r, locatie)) return false
      if (!needle) return true
      return [r.nume, r.nume_excel, r.grupe_excel, r.cursuri_noi]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [rows, stare, locatie, q])

  const columns: Column<StartSezonReinscriereRow>[] = [
    {
      header: 'Nume în aplicație',
      cell: (r) => (
        <div>
          <span className="font-medium text-ink">{r.nume}</span>
          {!acelasiNume(r.nume_excel, r.nume) && (
            <div className="text-[11px] text-muted">în registru: {r.nume_excel}</div>
          )}
        </div>
      ),
      sortValue: (r) => r.nume,
    },
    {
      header: 'Sala',
      cell: (r) => <span className="text-muted-2">{r.locatie_excel}</span>,
      sortValue: (r) => r.locatie_excel,
    },
    {
      header: 'Grupa din registru',
      cell: (r) => <span className="text-muted-2">{r.grupe_excel || '—'}</span>,
      sortValue: (r) => r.grupe_excel ?? '',
    },
    {
      header: 'În sezonul nou',
      cell: (r) =>
        r.inrolat ? (
          <span className="text-muted-2">{r.cursuri_noi ?? '—'}</span>
        ) : (
          <Badge tone="warn">lipsește</Badge>
        ),
      sortValue: (r) => (r.inrolat ? (r.cursuri_noi ?? 'zz') : ''),
    },
    {
      header: 'Semne de întrebare',
      cell: (r) => {
        const p = POTRIVIRE[r.potrivire]
        if (!p && !r.dublura_nume) return <span className="text-muted">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {p && (
              <Badge tone={r.potrivire === 'ambiguu' ? 'danger' : 'neutral'} className="cursor-help">
                <span title={p.titlu}>{p.text}</span>
              </Badge>
            )}
            {r.dublura_nume && (
              <Badge tone="danger" className="cursor-help">
                <span title={`Mai există o fișă pe numele „${r.dublura_nume}"`}>fișă dublă</span>
              </Badge>
            )}
          </div>
        )
      },
      sortValue: (r) => (r.dublura_nume ? 'a' : POTRIVIRE[r.potrivire] ? 'b' : 'c'),
    },
  ]

  return (
    <Section
      title="Reînscrieri semnate — au ajuns în aplicație?"
      note="Cele trei registre PROMO reînscrieri 26-27 (Ștefan, Nicolina, Q4Kids) arhivate din campania de aprilie–iunie. Cine a semnat e fix; dacă a ajuns sau nu în sezonul nou se recitește de fiecare dată, deci lista de lipsuri se golește singură pe măsură ce recepția îi introduce."
      actions={
        <div className="w-full md:w-72">
          <TextInput
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută după nume sau grupă…"
            aria-label="Caută în reînscrierile semnate"
          />
        </div>
      }
    >
      <div className="mb-4 flex flex-col gap-3">
        <SplitBar
          in={inN}
          out={outN}
          inLabel="intrate în aplicație"
          outLabel="lipsesc din sezonul nou"
        />
        <div className="flex flex-col gap-2">
          <FilterChips
            ariaLabel="Stare"
            value={stare}
            onChange={setStare}
            options={[
              { value: 'lipsa', label: 'Lipsă din sezon', count: outN },
              { value: 'ok', label: 'Intrate în app', count: inN },
              { value: 'toate', label: 'Toate', count: rowsPtStare.length },
            ]}
          />
          <FilterChips
            ariaLabel="Sala"
            value={locatie}
            onChange={setLocatie}
            options={locatii}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => (r.client_id ?? '') + r.nume_excel}
        onRowClick={(r) => r.client_id && navigate(`/clienti/${r.client_id}`)}
        maxHeight={460}
        emptyMessage="Niciun rând pentru filtrele alese."
      />
      <p className="mt-3 text-xs text-muted">
        {filtered.length} din {rows.length} semnături afișate.
      </p>
    </Section>
  )
}
