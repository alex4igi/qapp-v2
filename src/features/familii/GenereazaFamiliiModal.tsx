import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Checkbox, Modal, Spinner } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import {
  genereazaFamiliiLipsa,
  previewFamiliiLipsa,
  type FamilieLipsaActiune,
  type FamilieLipsaPreview,
} from './api'

type Props = { open: boolean; onClose: () => void }

type Tone = 'success' | 'danger' | 'warn' | 'neutral' | 'brand'

const ACTIUNE: Record<FamilieLipsaActiune, { label: string; tone: Tone }> = {
  familie_noua: { label: 'familie nouă', tone: 'success' },
  familie_proprie: { label: 'familie proprie', tone: 'brand' },
  ataseaza: { label: 'intră în familie existentă', tone: 'warn' },
  frate: { label: 'frate/soră', tone: 'warn' },
  sare: { label: 'nu se poate', tone: 'danger' },
  are_familie: { label: 'are deja familie', tone: 'neutral' },
  eroare: { label: 'eroare', tone: 'danger' },
}

const SELECTABILE: FamilieLipsaActiune[] = ['familie_noua', 'familie_proprie', 'ataseaza', 'frate']

const CATEGORIE_LABEL = {
  adult: 'adult',
  minor: 'minor',
  fara_data: 'fără data nașterii',
} as const

type Rezultat = { create: number; atasate: number; erori: string[] }

export function GenereazaFamiliiModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  // null = selecția implicită: toți cei pentru care regula are un răspuns
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [rezultat, setRezultat] = useState<Rezultat | null>(null)

  const preview = useQuery({
    queryKey: ['familii-lipsa-preview'],
    queryFn: previewFamiliiLipsa,
    enabled: open,
    staleTime: 0,
  })

  const rows = useMemo(() => preview.data ?? [], [preview.data])
  const implicit = useMemo(
    () => new Set(rows.filter((r) => SELECTABILE.includes(r.actiune)).map((r) => r.client_id)),
    [rows],
  )
  const sel = selected ?? implicit

  const deVerificat = rows.filter((r) => r.actiune === 'ataseaza' || r.actiune === 'frate')
  const restul = rows.filter((r) => r.actiune !== 'ataseaza' && r.actiune !== 'frate')
  const nr = (a: FamilieLipsaActiune) => rows.filter((r) => r.actiune === a).length

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev ?? implicit)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const generare = useMutation({
    mutationFn: async (): Promise<Rezultat> => {
      // ordinea previzualizării: primul frate creează familia, al doilea o găsește
      const ids = rows.filter((r) => sel.has(r.client_id)).map((r) => r.client_id)
      const res = await genereazaFamiliiLipsa(ids)
      const nume = new Map(rows.map((r) => [r.client_id, r.client_nume]))
      const out: Rezultat = { create: 0, atasate: 0, erori: [] }
      for (const r of res) {
        if (r.actiune === 'familie_noua' || r.actiune === 'familie_proprie') out.create++
        else if (r.actiune === 'ataseaza') out.atasate++
        else if (r.actiune !== 'are_familie')
          out.erori.push(`${nume.get(r.client_id) ?? r.client_id}: ${r.motiv ?? r.actiune}`)
      }
      return out
    },
    onSuccess: (r) => {
      setRezultat(r)
      setSelected(new Set())
      for (const key of ['familii', 'clienti', 'client', 'client-familia', 'contract-targets']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      void queryClient.invalidateQueries({ queryKey: ['lookup', 'familii'] })
      void queryClient.invalidateQueries({ queryKey: ['familii-lipsa-preview'] })
    },
  })

  function close() {
    setRezultat(null)
    setSelected(null)
    generare.reset()
    onClose()
  }

  const nrSelectate = sel.size

  return (
    <Modal
      open={open}
      onClose={close}
      title="Generează familiile lipsă"
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Închide
          </Button>
          {!rezultat && (
            <Button
              onClick={() => generare.mutate()}
              disabled={nrSelectate === 0 || generare.isPending || !preview.isSuccess}
            >
              {generare.isPending
                ? 'Se creează…'
                : `Creează familiile (${nrSelectate})`}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-2">
          Cursanți cu înrolare în curs și fără familie în fișă. Familia se construiește din
          telefonul și emailul de pe fișa copilului; numele părintelui vine din lead, unde există,
          altfel îl completează părintele la semnarea contractului.
        </p>

        {preview.isLoading ? (
          <Spinner />
        ) : preview.isError ? (
          <p className="text-sm text-red-600">{humanizeError(preview.error)}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-2">Toți cursanții activi au familie. Nimic de făcut.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-quasar-yellow/10 px-3 py-2 text-sm">
              <span className="font-medium">{rows.length} fără familie</span>
              <span>{nr('familie_noua')} familii noi</span>
              <span>{nr('familie_proprie')} adulți cu familie proprie</span>
              {deVerificat.length > 0 && (
                <span className="text-amber-700">{deVerificat.length} intră într-o familie existentă</span>
              )}
              {nr('sare') > 0 && <span className="text-red-600">{nr('sare')} nu se pot</span>}
            </div>

            {rezultat && (
              <div className="space-y-1 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
                <p className="font-medium text-green-700">
                  ✓ {rezultat.create} familii create, {rezultat.atasate} cursanți adăugați în familii
                  existente
                </p>
                {rezultat.erori.map((e, i) => (
                  <p key={i} className="text-red-600">
                    {e}
                  </p>
                ))}
              </div>
            )}
            {generare.isError && (
              <p className="text-sm text-red-600">{humanizeError(generare.error)}</p>
            )}

            {deVerificat.length > 0 && (
              <section>
                <h3 className="mb-1 text-sm font-semibold">
                  De verificat: telefonul e deja pe o familie
                </h3>
                <p className="mb-2 text-xs text-muted-2">
                  Copilul intră în familia găsită, ca frate/soră. Debifează dacă nu e aceeași familie.
                </p>
                <Lista rows={deVerificat} selected={sel} toggle={toggle} disabled={!!rezultat} />
              </section>
            )}

            <section>
              {deVerificat.length > 0 && <h3 className="mb-2 text-sm font-semibold">Restul</h3>}
              <Lista rows={restul} selected={sel} toggle={toggle} disabled={!!rezultat} />
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}

function varstaAni(d: string | null): number | null {
  if (!d) return null
  const n = new Date(d)
  const azi = new Date()
  let ani = azi.getFullYear() - n.getFullYear()
  if (azi < new Date(azi.getFullYear(), n.getMonth(), n.getDate())) ani--
  return ani
}

function Lista({
  rows,
  selected,
  toggle,
  disabled,
}: {
  rows: FamilieLipsaPreview[]
  selected: Set<string>
  toggle: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border border-line">
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const a = ACTIUNE[r.actiune]
          const selectabil = SELECTABILE.includes(r.actiune) && !disabled
          const ani = varstaAni(r.data_nasterii)
          return (
            <li key={r.client_id} className="flex items-start justify-between gap-3 px-3 py-2">
              <Checkbox
                id={`gen-${r.client_id}`}
                checked={selected.has(r.client_id)}
                disabled={!selectabil}
                onChange={() => toggle(r.client_id)}
                label={
                  <span>
                    <span className="font-medium">{r.client_nume}</span>
                    <span className="ml-2 text-xs text-muted-2">
                      {ani !== null ? `${ani} ani` : CATEGORIE_LABEL[r.categorie]}
                      {r.telefon ? ` · ${r.telefon}` : ''}
                    </span>
                    <span className="block text-xs text-muted-2">{r.grupe.join(', ')}</span>
                  </span>
                }
              />
              <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                <Badge tone={a.tone}>{a.label}</Badge>
                <span className="text-xs text-muted-2">
                  {r.actiune === 'ataseaza' || r.actiune === 'frate'
                    ? `→ fam. ${r.familie_nume ?? '?'}`
                    : r.actiune === 'familie_noua' || r.actiune === 'familie_proprie'
                      ? `fam. ${r.familie_nume ?? '?'}`
                      : ''}
                  {r.reprezentant && r.actiune !== 'familie_proprie'
                    ? ` · ${r.reprezentant}${r.sursa_reprezentant === 'lead' ? ' (din lead)' : ''}`
                    : ''}
                  {r.motiv ? ` · ${r.motiv}` : ''}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
