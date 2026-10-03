import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Badge, Button, Modal, Select, TextArea } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { SCOALA_PARTENERA, STATUSURI, STATUS_LABEL, updatePreinscriere, type Preinscriere, type StatusPreinscriere } from './api'
import { GRILE, STILURI, STIL_LABEL, ZILE_LABEL, grupaVarsta, GRUPA_LABEL } from './analiza'

// Fișa unei preînscrieri, lucrată la telefon: grila se corectează cu omul, apoi
// „Confirmă disponibilitatea". O grilă schimbată după confirmare redevine declarată
// (trigger în DB), deci confirmarea se dă după ultima modificare.
export function PreinscriereModal({
  p,
  onClose,
  onSaved,
  onOpenLead,
}: {
  p: Preinscriere
  onClose: () => void
  onSaved: () => void
  onOpenLead: (leadId: string) => void
}) {
  const [status, setStatus] = useState<StatusPreinscriere>(p.status as StatusPreinscriere)
  const [stiluri, setStiluri] = useState<string[]>(p.stiluri)
  const [grila, setGrila] = useState<string[]>(p.disponibilitate)
  const [nota, setNota] = useState(p.nota_staff ?? '')
  const [confirma, setConfirma] = useState(false)

  const grilaSchimbata =
    grila.length !== p.disponibilitate.length || grila.some((s) => !p.disponibilitate.includes(s))
  const confirmataAcum = !!p.disponibilitate_confirmata_la && !grilaSchimbata

  const save = useMutation({
    meta: { erroareAfisata: true },
    mutationFn: async () => {
      // Grila întâi, confirmarea separat: triggerul șterge confirmarea la o grilă nouă.
      await updatePreinscriere(p.id, {
        status,
        stiluri,
        disponibilitate: grila,
        nota_staff: nota.trim() || null,
      })
      if (confirma) {
        await updatePreinscriere(p.id, { disponibilitate_confirmata_la: new Date().toISOString() })
      }
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

  const nume = p.client ? [p.client.prenume, p.client.nume].filter(Boolean).join(' ') : p.nume_participant

  return (
    <Modal
      open
      size="lg"
      title={`${nume} · ${GRUPA_LABEL[grupaVarsta(p)]}${p.varsta != null ? ` (${p.varsta} ani)` : ''}`}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="text-xs text-danger">{save.error ? String((save.error as Error).message) : ''}</div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Renunță</Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || stiluri.length === 0}
            >
              {save.isPending ? 'Se salvează…' : 'Salvează'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        <div className="grid gap-2 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-quasar-gray">Contact</div>
            <div className="font-medium">{p.nume_contact}</div>
            <a className="text-brand underline" href={`tel:${p.telefon}`}>{p.telefon}</a>
            {p.email && <div className="text-xs text-quasar-gray">{p.email}</div>}
          </div>
          <div>
            <div className="text-xs text-quasar-gray">Cerere</div>
            <div>{formatDateTime(p.created)}</div>
            <div className="text-xs text-quasar-gray">
              {[p.utm_source, p.utm_content].filter(Boolean).join(' · ') || 'fără sursă'}
              {p.elev_scoala_partenera != null && ` · ${p.elev_scoala_partenera ? `elev la ${SCOALA_PARTENERA}` : 'din afara școlii partenere'}`}
            </div>
            {p.client && <Badge tone="brand">client existent</Badge>}
            {p.lead_id && (
              <button type="button" className="mt-1 text-xs text-brand underline" onClick={() => onOpenLead(p.lead_id!)}>
                Deschide leadul
              </button>
            )}
          </div>
          {p.observatii && (
            <div className="sm:col-span-2">
              <div className="text-xs text-quasar-gray">Observațiile familiei</div>
              <div className="whitespace-pre-wrap">{p.observatii}</div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 font-medium">Stare</div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusPreinscriere)}
            options={STATUSURI.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
        </div>

        <div>
          <div className="mb-1 font-medium">Activități</div>
          <div className="flex flex-wrap gap-2">
            {STILURI.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStiluri((l) => toggle(l, s))}
                className={`rounded-full border px-3 py-1 ${stiluri.includes(s) ? 'border-brand bg-brand text-white' : 'border-line'}`}
              >
                {STIL_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center gap-2 font-medium">
            Când poate
            {confirmataAcum ? (
              <Badge tone="success">confirmat la telefon · {formatDateTime(p.disponibilitate_confirmata_la)}</Badge>
            ) : (
              <Badge tone="warn">declarat, neconfirmat</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-6">
            {GRILE.map((g) => (
              <table key={g.titlu} className="self-start text-center">
                <thead>
                  <tr>
                    <th className="pr-3 pb-1 text-left text-xs font-semibold">{g.titlu}</th>
                    {g.intervale.map((i) => (
                      <th key={i} className="px-2 pb-1 text-xs font-normal text-quasar-gray">{i.replace('-', '–')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.zile.map((z) => (
                    <tr key={z}>
                      <td className="pr-3 text-left text-xs">{ZILE_LABEL[z]}</td>
                      {g.intervale.map((i) => {
                        const slot = `${z} ${i}`
                        const on = grila.includes(slot)
                        return (
                          <td key={i} className="p-0.5">
                            <button
                              type="button"
                              aria-pressed={on}
                              aria-label={`${ZILE_LABEL[z]} ${i}`}
                              onClick={() => setGrila((gr) => toggle(gr, slot))}
                              className={`h-8 w-16 rounded border ${on ? 'border-brand bg-brand text-white' : 'border-line bg-card'}`}
                            >
                              {on ? '✓' : ''}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" checked={confirma} onChange={(e) => setConfirma(e.target.checked)} />
            Am vorbit cu familia: grila de mai sus e confirmată
          </label>
        </div>

        <div>
          <div className="mb-1 font-medium">Notă internă</div>
          <TextArea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
