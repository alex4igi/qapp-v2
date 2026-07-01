import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, Select, Spinner, TextInput } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { listFamilii } from '@/features/familii/api'
import { getFamilieMembers } from '@/features/familii/api'
import { listTemplates, sendContracte } from './api'
import { CONTRACT_TIP_LABEL } from './constants'

type Props = {
  open: boolean
  onClose: () => void
  // precompletare când modalul e deschis de pe profilul unei familii
  familieId?: string
  familieNume?: string
}

export function TrimiteContractModal({ open, onClose, familieId, familieNume }: Props) {
  const queryClient = useQueryClient()
  const [templateId, setTemplateId] = useState('')
  const [search, setSearch] = useState('')
  const [selFamilie, setSelFamilie] = useState<{ id: string; nume: string } | null>(
    familieId ? { id: familieId, nume: familieNume ?? '' } : null,
  )
  const [clientId, setClientId] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const { data: templates } = useQuery({
    queryKey: ['contract-templates'],
    queryFn: listTemplates,
    enabled: open,
  })

  const { data: familii, isFetching: searching } = useQuery({
    queryKey: ['familii-search', search],
    queryFn: () => listFamilii({ search, page: 0 }),
    enabled: open && !selFamilie && search.trim().length >= 2,
  })

  const { data: membri } = useQuery({
    queryKey: ['familie-membri', selFamilie?.id],
    queryFn: () => getFamilieMembers(selFamilie!.id),
    enabled: open && !!selFamilie,
  })

  const templateOptions = useMemo(
    () =>
      (templates ?? []).map((t) => ({
        value: t.id,
        label: `${t.nume} (${CONTRACT_TIP_LABEL[t.tip] ?? t.tip})`,
      })),
    [templates],
  )

  const send = useMutation({
    mutationFn: () =>
      sendContracte({
        templateId,
        targets: [{ familieId: selFamilie!.id, clientId: clientId || null }],
      }),
    onSuccess: (results) => {
      const r = results[0]
      if (r?.ok) {
        setResult('Linkul de semnare a fost trimis prin SMS.')
        queryClient.invalidateQueries({ queryKey: ['contracte'] })
      } else {
        setResult(`Nu s-a putut trimite: ${r?.error ?? 'eroare necunoscută'}`)
      }
    },
    onError: (e) => setResult(humanizeError(e)),
  })

  function close() {
    setResult(null)
    setSearch('')
    if (!familieId) setSelFamilie(null)
    setClientId('')
    send.reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Trimite contract la semnat">
      <div className="space-y-4">
        <Field label="Template">
          <Select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Alege template…"
            options={templateOptions}
          />
        </Field>

        <Field label="Familia">
          {selFamilie ? (
            <div className="flex items-center gap-2">
              <span className="font-medium">{selFamilie.nume || 'Familie selectată'}</span>
              {!familieId && (
                <Button variant="ghost" onClick={() => setSelFamilie(null)}>
                  Schimbă
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Caută după nume, telefon, email…"
              />
              {searching && <Spinner />}
              {familii && familii.rows.length > 0 && (
                <ul className="max-h-48 overflow-auto rounded border border-quasar-gray/30 divide-y divide-quasar-gray/20">
                  {familii.rows.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-quasar-yellow/10"
                        onClick={() =>
                          setSelFamilie({ id: f.id, nume: f.nume_familie ?? '' })
                        }
                      >
                        <span className="font-medium">{f.nume_familie}</span>
                        {f.telefon && (
                          <span className="ml-2 text-sm text-quasar-gray">{f.telefon}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>

        {selFamilie && (
          <Field label="Copil vizat (opțional — implicit toți copiii familiei)">
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              options={[
                { value: '', label: 'Toți copiii' },
                ...(membri ?? []).map((m) => ({
                  value: m.id,
                  label: `${m.nume} ${m.prenume ?? ''}`.trim(),
                })),
              ]}
            />
          </Field>
        )}

        {result && (
          <p
            className={
              result.startsWith('Linkul') ? 'text-green-700 text-sm' : 'text-red-600 text-sm'
            }
          >
            {result}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Închide
          </Button>
          <Button
            onClick={() => send.mutate()}
            disabled={!templateId || !selFamilie || send.isPending}
          >
            {send.isPending ? 'Se trimite…' : 'Trimite la semnat'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
