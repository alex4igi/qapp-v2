import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Select } from '@/components/ui'
import { downloadCsv } from '@/lib/csv'
import type { Preinscriere } from './api'
import {
  GRUPA_LABEL,
  GRUPE_VARSTA,
  GRILE,
  SLOTURI,
  STILURI,
  STIL_LABEL,
  ZILE,
  ZILE_LABEL,
  candidati,
  cheieGrupa,
  cheiePersoana,
  compatibil,
  esteConfirmat,
  evalueazaScenariu,
  grupaVarsta,
  numeGrupa,
  tinta,
  type Grupa,
  type GrupaVarsta,
  type Ipoteze,
} from './analiza'

// Scenariul e o ciornă a omului care decide — rămâne în browserul lui, nu în DB
// (se recalculează oricând din preînscrieri). Exportul cu data e dovada deciziei.
const CHEIE_SCENARIU = 'qapp.preinscrieri.scenariu.v1'

const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })

function citesteScenariu(): Grupa[] {
  try {
    const raw = window.localStorage.getItem(CHEIE_SCENARIU)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function DecizieGrupe({ persoane }: { persoane: Preinscriere[] }) {
  const [ip, setIp] = useState<Ipoteze>({ prag: 8, rata: 0.5, grupePeInterval: 2, doarConfirmati: false })
  const [grupe, setGrupe] = useState<Grupa[]>(citesteScenariu)
  const [hartaVarsta, setHartaVarsta] = useState<GrupaVarsta | ''>('')
  const [hartaStil, setHartaStil] = useState('')
  const [deschisa, setDeschisa] = useState<string | null>(null)
  const [nou, setNou] = useState<Grupa>({ varsta: 'Junior', stil: 'Street Dance', slot: 'Lu 15-17' })

  useEffect(() => {
    try {
      window.localStorage.setItem(CHEIE_SCENARIU, JSON.stringify(grupe))
    } catch {
      /* stocare blocată — scenariul rămâne doar pe ecran */
    }
  }, [grupe])

  const baza = useMemo(
    () => (ip.doarConfirmati ? persoane.filter(esteConfirmat) : persoane),
    [persoane, ip.doarConfirmati],
  )
  const rez = useMemo(() => evalueazaScenariu(persoane, grupe, ip), [persoane, grupe, ip])
  const sugestii = useMemo(() => candidati(persoane, grupe, ip), [persoane, grupe, ip])
  const prag = tinta(ip)

  const adauga = (g: Grupa) =>
    setGrupe((l) => (l.some((x) => cheieGrupa(x) === cheieGrupa(g)) ? l : [...l, g]))

  const exporta = () => {
    const ipoteze = `Ipoteze: ${ip.prag} plătitori minim/grupă, conversie ${Math.round(ip.rata * 100)}% => țintă ${prag} preînscrieri; ${ip.grupePeInterval} grupe/interval de 2 ore; numărate: ${ip.doarConfirmati ? 'doar confirmați' : 'declarați'}`
    const randuri = [...rez.grupe]
      .sort((a, b) => ZILE.indexOf(a.grupa.slot.slice(0, 2) as never) - ZILE.indexOf(b.grupa.slot.slice(0, 2) as never) || a.grupa.slot.localeCompare(b.grupa.slot))
      .map((r) => [
        ZILE_LABEL[r.grupa.slot.slice(0, 2) as (typeof ZILE)[number]],
        r.grupa.slot.slice(3).replace('-', '–'),
        GRUPA_LABEL[r.grupa.varsta],
        STIL_LABEL[r.grupa.stil] ?? r.grupa.stil,
        r.membri.length,
        r.confirmati,
        r.membri.length >= prag ? 'da' : 'sub țintă',
      ])
    downloadCsv(
      `cerere-inchiriere-valea-lupului-${todayIso()}.csv`,
      ['Zi', 'Interval', 'Grupa de vârstă', 'Activitate', 'Preînscriși', 'Confirmați la telefon', 'Atinge ținta'],
      [
        ...randuri,
        [],
        ['Ore de sală pe săptămână', rez.oreSalaPeSaptamana],
        ['Participanți acoperiți', baza.length - rez.neacoperiti.length, 'din', baza.length],
        [ipoteze],
        [`Generat ${todayIso()} din preînscrierile din qapp`],
      ],
    )
  }

  // Cererea pe vârstă × activitate (o persoană cu două activități apare la ambele).
  const matrice = GRUPE_VARSTA.map((v) => ({
    v,
    celule: STILURI.map((s) => baza.filter((p) => grupaVarsta(p) === v && p.stiluri.includes(s)).length),
    total: baza.filter((p) => grupaVarsta(p) === v).length,
  }))
  const cuDouaStiluri = baza.filter((p) => p.stiluri.length > 1).length

  const harta = GRILE.map((g) => ({
    titlu: g.titlu,
    intervale: g.intervale,
    randuri: g.zile.map((z) => ({
      z,
      celule: g.intervale.map((i) => {
        const slot = `${z} ${i}`
        return baza.filter(
          (p) =>
            p.disponibilitate.includes(slot) &&
            (!hartaVarsta || grupaVarsta(p) === hartaVarsta) &&
            (!hartaStil || p.stiluri.includes(hartaStil)),
        ).length
      }),
    })),
  }))
  const maxHarta = Math.max(1, ...harta.flatMap((g) => g.randuri.flatMap((r) => r.celule)))

  const optVarsta = GRUPE_VARSTA.map((v) => ({ value: v, label: GRUPA_LABEL[v] }))
  const optStil = STILURI.map((s) => ({ value: s, label: STIL_LABEL[s] }))
  const optSlot = SLOTURI.map((slot) => ({
    value: slot,
    label: `${ZILE_LABEL[slot.slice(0, 2) as (typeof ZILE)[number]]} ${slot.slice(3).replace('-', '–')}`,
  }))

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-card p-4">
        <h3 className="mb-3 font-semibold">Ipoteze</h3>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-quasar-gray">Minim plătitori pe grupă</span>
            <input type="number" min={1} max={30} value={ip.prag}
              onChange={(e) => setIp({ ...ip, prag: Math.max(1, Number(e.target.value) || 1) })}
              className="w-24 rounded border border-line px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-quasar-gray">Din preînscriși ajung plătitori (%)</span>
            <input type="number" min={5} max={100} step={5} value={Math.round(ip.rata * 100)}
              onChange={(e) => setIp({ ...ip, rata: Math.min(1, Math.max(0.05, (Number(e.target.value) || 5) / 100)) })}
              className="w-24 rounded border border-line px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-quasar-gray">Grupe într-un interval de 2 ore</span>
            <input type="number" min={1} max={4} value={ip.grupePeInterval}
              onChange={(e) => setIp({ ...ip, grupePeInterval: Math.max(1, Number(e.target.value) || 1) })}
              className="w-24 rounded border border-line px-2 py-1" />
          </label>
          <label className="flex items-center gap-2 pb-1">
            <input type="checkbox" checked={ip.doarConfirmati}
              onChange={(e) => setIp({ ...ip, doarConfirmati: e.target.checked })} />
            Număr doar ce e confirmat la telefon
          </label>
        </div>
        <p className="mt-3 text-xs text-quasar-gray">
          Țintă pe grupă: <strong>{prag} preînscrieri</strong> ({ip.prag} plătitori ÷ {Math.round(ip.rata * 100)}%).
          Pragul de 8 din reguli e în cursanți plătitori; rata de conversie e o presupunere, nu o dată.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-card p-4">
          <h3 className="mb-1 font-semibold">Cererea pe vârstă și activitate</h3>
          <p className="mb-3 text-xs text-quasar-gray">
            {baza.length} participanți · {cuDouaStiluri} au bifat mai multe activități (apar în fiecare coloană).
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-quasar-gray">
                <th className="text-left font-normal" />
                {STILURI.map((s) => <th key={s} className="px-1 text-right font-normal">{STIL_LABEL[s]}</th>)}
                <th className="px-1 text-right font-normal">Oameni</th>
              </tr>
            </thead>
            <tbody>
              {matrice.map((r) => (
                <tr key={r.v} className="border-t border-line">
                  <td className="py-1">{GRUPA_LABEL[r.v]}</td>
                  {r.celule.map((n, i) => <td key={i} className="px-1 text-right tabular-nums">{n || '·'}</td>)}
                  <td className="px-1 text-right font-medium tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-line bg-card p-4">
          <h3 className="mb-2 font-semibold">Când pot veni</h3>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Select value={hartaVarsta} onChange={(e) => setHartaVarsta(e.target.value as GrupaVarsta | '')}
              options={[{ value: '', label: 'Toate vârstele' }, ...optVarsta]} />
            <Select value={hartaStil} onChange={(e) => setHartaStil(e.target.value)}
              options={[{ value: '', label: 'Toate activitățile' }, ...optStil]} />
          </div>
          <div className="space-y-3">
            {harta.map((g) => (
              <table key={g.titlu} className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-quasar-gray">
                    <th className="w-24 text-left font-semibold">{g.titlu}</th>
                    {g.intervale.map((i) => <th key={i} className="font-normal">{i.replace('-', '–')}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {g.randuri.map((r) => (
                    <tr key={r.z}>
                      <td className="py-0.5 pr-2 text-xs">{ZILE_LABEL[r.z]}</td>
                      {r.celule.map((n, i) => (
                        <td key={i} className="p-0.5">
                          <div
                            className="rounded py-1.5 text-center tabular-nums"
                            style={{ background: n ? `color-mix(in srgb, var(--color-brand, #f8ef21) ${Math.round(15 + 70 * (n / maxHarta))}%, transparent)` : undefined }}
                          >
                            {n || '·'}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
          <p className="mt-2 text-xs text-quasar-gray">
            Un om bifează mai multe căsuțe — suma căsuțelor nu e numărul de oameni.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Grupele propuse</h3>
          <div className="flex gap-2">
            {grupe.length > 0 && <Button variant="ghost" onClick={() => setGrupe([])}>Golește</Button>}
            <Button variant="secondary" onClick={exporta} disabled={!grupe.length}>
              Exportă cererea de închiriere
            </Button>
          </div>
        </div>

        <div className="mb-4 grid items-center gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
          <Select value={nou.varsta} onChange={(e) => setNou({ ...nou, varsta: e.target.value as GrupaVarsta })} options={optVarsta} />
          <Select value={nou.stil} onChange={(e) => setNou({ ...nou, stil: e.target.value })} options={optStil} />
          <Select value={nou.slot} onChange={(e) => setNou({ ...nou, slot: e.target.value })} options={optSlot} />
          <Button onClick={() => adauga(nou)}>Adaugă grupa</Button>
        </div>
        <p className="-mt-2 mb-4 text-xs text-quasar-gray">
          {persoane.filter((p) => compatibil(p, nou, ip.doarConfirmati)).length} compatibili cu grupa aleasă (înainte de
          celelalte grupe)
        </p>

        {rez.grupe.length === 0 ? (
          <p className="text-sm text-quasar-gray">Nicio grupă încă. Alege una mai sus sau din sugestii.</p>
        ) : (
          <ul className="space-y-2">
            {rez.grupe.map((r, idx) => {
              const k = cheieGrupa(r.grupa)
              const ok = r.membri.length >= prag
              return (
                <li key={k} className="rounded border border-line">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="w-5 text-xs text-quasar-gray">{idx + 1}.</span>
                    <button type="button" className="font-medium hover:underline" onClick={() => setDeschisa(deschisa === k ? null : k)}>
                      {numeGrupa(r.grupa)}
                    </button>
                    <Badge tone={ok ? 'success' : 'warn'}>
                      {r.membri.length}/{prag}
                    </Badge>
                    <span className="text-xs text-quasar-gray">{r.confirmati} confirmați</span>
                    {r.suprapunere && <Badge tone="danger">prea multe grupe în interval</Badge>}
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" disabled={idx === 0}
                        onClick={() => setGrupe((l) => { const c = [...l]; [c[idx - 1], c[idx]] = [c[idx], c[idx - 1]]; return c })}>↑</Button>
                      <Button variant="ghost" onClick={() => setGrupe((l) => l.filter((_, i) => i !== idx))}>Scoate</Button>
                    </div>
                  </div>
                  {deschisa === k && (
                    <div className="border-t border-line px-3 py-2 text-xs">
                      {r.membri.length === 0
                        ? 'Nimeni rămas liber pentru grupa asta (cei compatibili sunt în grupele de deasupra).'
                        : r.membri.map((p) => `${p.nume_participant}${p.varsta != null ? ` (${p.varsta})` : ''}${esteConfirmat(p) ? ' ✓' : ''}`).join(' · ')}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {rez.grupe.length > 0 && (
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded border border-line p-3">
              <div className="text-xs text-quasar-gray">Ore de sală pe săptămână</div>
              <div className="text-lg font-semibold">{rez.oreSalaPeSaptamana}</div>
            </div>
            <div className="rounded border border-line p-3">
              <div className="text-xs text-quasar-gray">Rămân fără grupă</div>
              <div className="text-lg font-semibold">{rez.neacoperiti.length} din {baza.length}</div>
            </div>
            <div className="rounded border border-line p-3">
              <div className="text-xs text-quasar-gray">În două grupe (două activități)</div>
              <div className="text-lg font-semibold">{rez.douaActivitati}</div>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-quasar-gray">
          Grupele se umplu în ordinea din listă: cine intră într-o grupă nu mai e numărat într-o altă grupă de
          aceeași activitate sau în același interval. Ordinea se schimbă cu ↑.
        </p>
      </section>

      <section className="rounded-lg border border-line bg-card p-4">
        <h3 className="mb-1 font-semibold">Sugestii</h3>
        <p className="mb-3 text-xs text-quasar-gray">
          Cele mai pline combinații, numărate doar pe oamenii încă fără grupă. Sala, instructorul și a doua ședință pe
          săptămână le verifici tu.
        </p>
        {sugestii.length === 0 ? (
          <p className="text-sm text-quasar-gray">Nimic de sugerat.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sugestii.map((s) => (
              <button key={cheieGrupa(s.grupa)} type="button" onClick={() => adauga(s.grupa)}
                className={`rounded-full border px-3 py-1 text-sm hover:border-brand ${s.n >= prag ? 'border-success' : 'border-line'}`}>
                {numeGrupa(s.grupa)} · <strong>{s.n}</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      {rez.neacoperiti.length > 0 && rez.grupe.length > 0 && (
        <section className="rounded-lg border border-line bg-card p-4 text-sm">
          <h3 className="mb-2 font-semibold">Fără grupă în scenariul ăsta</h3>
          <ul className="space-y-1">
            {rez.neacoperiti.map((p) => (
              <li key={cheiePersoana(p)}>
                {p.nume_participant} · {GRUPA_LABEL[grupaVarsta(p)]} · {p.stiluri.map((s) => STIL_LABEL[s] ?? s).join(', ')}
                <span className="text-xs text-quasar-gray"> · {p.disponibilitate.join(', ') || 'fără ore bifate'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
