import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DateInput, TextInput } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import {
  getInteractiuniK4,
  getPuncteK4,
  salveazaInteractiuniK4,
  type CanalK4,
  type InteractiuneK4,
} from './api'

function aziIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function lunaDin(zi: string): { de: string; panaLa: string } {
  const [y, m] = zi.split('-').map(Number)
  const ultima = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { de: `${y}-${mm}-01`, panaLa: `${y}-${mm}-${String(ultima).padStart(2, '0')}` }
}

type Rand = { locatie_id: string; locatie_nume: string; canal: CanalK4 }
type Valori = Record<string, { intrate: string; cu_raspuns: string }>

const cheie = (r: { locatie_id: string; canal: CanalK4 }) => `${r.locatie_id}:${r.canal}`
const ETICHETA: Record<CanalK4, string> = { telefon: 'Telefon', meta: 'Meta' }

/**
 * K4 la recepție: telefonul și Meta le introduce managerul, zilnic, într-un singur loc —
 * recepția nu se autoevaluează. Leadurile se măsoară singure, din aplicație.
 */
export function InteractiuniK4Card() {
  const queryClient = useQueryClient()
  const [zi, setZi] = useState(aziIso)
  const luna = useMemo(() => lunaDin(zi), [zi])

  const puncte = useQuery({ queryKey: ['k4-puncte'], queryFn: getPuncteK4 })
  const date = useQuery({
    queryKey: ['k4-interactiuni', luna.de],
    queryFn: () => getInteractiuniK4(luna.de, luna.panaLa),
  })

  const randuri = useMemo<Rand[]>(
    () =>
      (puncte.data ?? []).flatMap((p) => [
        { locatie_id: p.locatie_id, locatie_nume: p.locatie_nume, canal: 'telefon' as const },
        ...(p.cu_meta
          ? [{ locatie_id: p.locatie_id, locatie_nume: p.locatie_nume, canal: 'meta' as const }]
          : []),
      ]),
    [puncte.data],
  )

  const [valori, setValori] = useState<Valori>({})
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [eroare, setEroare] = useState<string | null>(null)

  useEffect(() => {
    const v: Valori = {}
    for (const d of date.data ?? []) {
      if (d.zi === zi) v[cheie(d)] = { intrate: String(d.intrate), cu_raspuns: String(d.cu_raspuns) }
    }
    setValori(v)
    setMesaj(null)
    setEroare(null)
  }, [date.data, zi])

  const zileCompletate = (r: Rand) =>
    (date.data ?? []).filter((d) => d.locatie_id === r.locatie_id && d.canal === r.canal).length

  const salveaza = useMutation({
    mutationFn: () => {
      const deSalvat: InteractiuneK4[] = randuri
        .filter((r) => valori[cheie(r)]?.intrate !== undefined && valori[cheie(r)]?.intrate !== '')
        .map((r) => ({
          locatie_id: r.locatie_id,
          zi,
          canal: r.canal,
          intrate: Math.max(0, Math.round(Number(valori[cheie(r)].intrate) || 0)),
          cu_raspuns: Math.max(0, Math.round(Number(valori[cheie(r)].cu_raspuns) || 0)),
        }))
      if (deSalvat.some((d) => d.cu_raspuns > d.intrate)) {
        throw new Error('„Cu răspuns" nu poate fi mai mare decât „Intrate".')
      }
      return salveazaInteractiuniK4(deSalvat)
    },
    onSuccess: () => {
      setEroare(null)
      setMesaj('Salvat.')
      void queryClient.invalidateQueries({ queryKey: ['k4-interactiuni', luna.de] })
      void queryClient.invalidateQueries({ queryKey: ['raport-kpi'] })
    },
    onError: (e) => {
      setMesaj(null)
      setEroare(humanizeError(e))
    },
  })

  if (puncte.isLoading || (puncte.data ?? []).length === 0) return null

  const set = (r: Rand, camp: 'intrate' | 'cu_raspuns', v: string) =>
    setValori((prev) => ({
      ...prev,
      [cheie(r)]: { ...(prev[cheie(r)] ?? { intrate: '', cu_raspuns: '' }), [camp]: v },
    }))

  return (
    <div className="mb-6 rounded-xl border border-line bg-card p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Interacțiuni zilnice · K4 recepție</h3>
        <div className="flex items-center gap-2">
          <DateInput value={zi} onChange={(e) => e.target.value && setZi(e.target.value)} />
          <Button onClick={() => salveaza.mutate()} disabled={salveaza.isPending}>
            {salveaza.isPending ? 'Se salvează…' : 'Salvează ziua'}
          </Button>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted">
        Le completează managerul, în fiecare zi. <b>Telefon</b>: din istoricul de apeluri al
        telefonului recepției — apelurile primite (inclusiv cele pierdute) și câte au primit răspuns
        sau au fost sunate înapoi în 24 h. <b>Meta</b>: din Business Suite → Inbox, toate cele patru
        tab-uri (Messenger, Instagram, comentarii Facebook și Instagram) — mesajele și
        comentariile-întrebare noi și câte au primit răspuns în 24 h. O zi fără nimic intrat se
        salvează cu 0.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 pr-3 font-medium">Canal</th>
              <th className="py-1 pr-3 font-medium">Intrate</th>
              <th className="py-1 pr-3 font-medium">Cu răspuns în 24 h</th>
              <th className="py-1 font-medium">Zile completate luna asta</th>
            </tr>
          </thead>
          <tbody>
            {randuri.map((r) => (
              <tr key={cheie(r)} className="border-t border-line">
                <td className="py-2 pr-3 text-ink">
                  {ETICHETA[r.canal]} · {r.locatie_nume}
                </td>
                <td className="py-2 pr-3">
                  <TextInput
                    type="number"
                    min={0}
                    step={1}
                    className="w-24"
                    value={valori[cheie(r)]?.intrate ?? ''}
                    onChange={(e) => set(r, 'intrate', e.target.value)}
                  />
                </td>
                <td className="py-2 pr-3">
                  <TextInput
                    type="number"
                    min={0}
                    step={1}
                    className="w-24"
                    value={valori[cheie(r)]?.cu_raspuns ?? ''}
                    onChange={(e) => set(r, 'cu_raspuns', e.target.value)}
                  />
                </td>
                <td className="py-2 text-muted">{zileCompletate(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mesaj && <p className="mt-2 text-xs text-success">{mesaj}</p>}
      {eroare && <p className="mt-2 text-xs text-danger">{eroare}</p>}
    </div>
  )
}
