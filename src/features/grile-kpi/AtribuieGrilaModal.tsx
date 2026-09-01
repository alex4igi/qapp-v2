import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, Button, Combobox, Select, TextInput, Checkbox } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { locatiiOptions } from '@/lib/lookups'
import { atribuieGrila, getSabloane, getTitulari } from './api'

type Props = { open: boolean; onClose: () => void; onCreat: (id: string) => void }

/** Prima zi a lunii următoare — grilele pornesc doar la graniță de lună. */
function primaZiLunaViitoare() {
  const d = new Date()
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 10)
}

export function AtribuieGrilaModal({ open, onClose, onCreat }: Props) {
  const queryClient = useQueryClient()
  const [sablonId, setSablonId] = useState('')
  const [titularKey, setTitularKey] = useState('')
  const [nume, setNume] = useState('')
  const [locatii, setLocatii] = useState<string[]>([])
  const [deLa, setDeLa] = useState(primaZiLunaViitoare())
  const [error, setError] = useState<string | null>(null)

  const sabloane = useQuery({ queryKey: ['kpi-sabloane'], queryFn: getSabloane, enabled: open })
  const titulari = useQuery({ queryKey: ['kpi-titulari'], queryFn: getTitulari, enabled: open })
  const locOptions = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions })

  const titularSelectat = useMemo(
    () => titulari.data?.find((t) => `${t.tip}:${t.titular_id}` === titularKey),
    [titulari.data, titularKey],
  )

  useEffect(() => {
    if (!open) return
    setSablonId('')
    setTitularKey('')
    setNume('')
    setLocatii([])
    setDeLa(primaZiLunaViitoare())
    setError(null)
  }, [open])

  // Numele vine din cont; conturile de recepție n-au nume real, deci apare
  // emailul. Îl precompletăm și îl lăsăm editabil.
  useEffect(() => {
    if (titularSelectat) setNume(titularSelectat.nume_afisat)
  }, [titularSelectat])

  const save = useMutation({
    mutationFn: () =>
      atribuieGrila({
        sablonId,
        titularTip: titularSelectat!.tip,
        titularId: titularSelectat!.titular_id,
        locatii,
        valabilDeLa: deLa,
        titularNume: nume.trim() || undefined,
      }),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ['kpi-grile'] })
      onCreat(id)
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la atribuirea grilei.')),
  })

  const gata = sablonId && titularSelectat && locatii.length > 0 && deLa

  return (
    <Modal
      open={open}
      title="Atribuie o grilă de bonus"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Anulează</Button>
          <Button onClick={() => save.mutate()} disabled={!gata || save.isPending}>
            {save.isPending ? 'Se creează…' : 'Creează grila'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Șablon de post" required>
          <Select
            value={sablonId}
            onChange={(e) => setSablonId(e.target.value)}
            options={[
              { value: '', label: '— alege șablonul —' },
              ...(sabloane.data ?? []).map((s) => ({
                value: s.id,
                label: `${s.nume} · ${s.perioada === 'vara' ? 'vară' : 'sezon'}`,
              })),
            ]}
          />
        </Field>

        <Field label="Angajat" required>
          <Combobox
            options={(titulari.data ?? []).map((t) => ({
              value: `${t.tip}:${t.titular_id}`,
              label: t.nume_afisat,
              secondary: [t.rol, t.email, t.are_grila ? 'are deja grilă' : null]
                .filter(Boolean)
                .join(' · '),
            }))}
            value={titularKey}
            onChange={setTitularKey}
            placeholder="caută după nume…"
          />
        </Field>

        {titularSelectat && (
          <Field label="Nume afișat în raport">
            <TextInput value={nume} onChange={(e) => setNume(e.target.value)} />
            <p className="mt-1 text-xs text-muted">
              Contul dă doar emailul, deci corectează-l aici cu numele real —
              apare pe raportul lunar și pe PDF-ul angajatului.
            </p>
          </Field>
        )}

        <Field label="Puncte de lucru acoperite" required>
          <div className="flex flex-wrap gap-3">
            {(locOptions.data ?? []).map((l) => (
              <Checkbox
                key={l.value}
                label={l.label}
                checked={locatii.includes(l.value)}
                onChange={(e) =>
                  setLocatii((prev) =>
                    e.target.checked
                      ? [...prev, l.value]
                      : prev.filter((x) => x !== l.value),
                  )
                }
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            Mai multe locații se calculează împreună, ca o singură bază.
          </p>
        </Field>

        <Field label="Valabilă de la" required>
          <TextInput type="date" value={deLa} onChange={(e) => setDeLa(e.target.value)} />
          <p className="mt-1 text-xs text-muted">
            Doar ziua 1 a unei luni: altfel acoperirea parțială s-ar suprapune
            peste pro-rata pe zile lucrate.
          </p>
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
