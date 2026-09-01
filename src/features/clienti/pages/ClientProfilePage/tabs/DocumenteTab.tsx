import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, TextInput, DateInput, TextArea, Select, Button, Spinner } from '@/components/ui'
import { tipDocumentOptions } from '@/lib/enums'
import type { Client, Enums, InsertDto } from '@/types/db'
import {
  listDocumenteClient,
  createDocumentClient,
  deleteDocumentClient,
} from '../../../api'

type Props = {
  client: Client
}

const TIP_EMOJI: Record<string, string> = {
  Contract: '📄',
  Anexa: '📎',
  Reziliere: '🚪',
  Medical: '🩺',
  Declaratie: '📝',
  Altul: '📁',
}

const TIP_LABEL: Record<string, string> = {
  Contract: 'Contract',
  Anexa: 'Anexă',
  Reziliere: 'Reziliere',
  Medical: 'Medical',
  Declaratie: 'Declarație',
  Altul: 'Altul',
}

function expirareInfo(data: string | null): { text: string; tone: string } | null {
  if (!data) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(data)
  const zile = Math.round((exp.getTime() - today.getTime()) / 86_400_000)
  if (zile < 0) return { text: `expirat (${data})`, tone: 'text-red-600' }
  if (zile <= 30) return { text: `expiră ${data} (${zile}z)`, tone: 'text-amber-600' }
  return { text: `valabil până ${data}`, tone: 'text-quasar-gray' }
}

export function DocumenteTab({ client }: Props) {
  const queryClient = useQueryClient()
  const [tip, setTip] = useState<Enums<'tip_document'>>('Contract')
  const [titlu, setTitlu] = useState('')
  const [link, setLink] = useState('')
  const [expirare, setExpirare] = useState('')
  const [observatii, setObservatii] = useState('')
  const [error, setError] = useState<string | null>(null)

  const docsQ = useQuery({
    queryKey: ['documente-client', client.id],
    queryFn: () => listDocumenteClient(client.id),
  })

  const createM = useMutation({
    mutationFn: () => {
      const dto: InsertDto<'documente_client'> = {
        client: client.id,
        tip,
        titlu: titlu.trim() || null,
        link: link.trim(),
        data_expirarii: expirare || null,
        observatii: observatii.trim() || null,
      }
      return createDocumentClient(dto)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documente-client', client.id] })
      setTitlu('')
      setLink('')
      setExpirare('')
      setObservatii('')
      setError(null)
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteDocumentClient(id),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['documente-client', client.id] }),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!link.trim()) {
      setError('Lipește linkul documentului (Google Drive).')
      return
    }
    createM.mutate()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-display text-sm font-bold text-quasar-black">Documente</h2>

        {docsQ.isLoading ? (
          <Spinner />
        ) : docsQ.data && docsQ.data.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {docsQ.data.map((d) => {
              const exp = expirareInfo(d.data_expirarii)
              return (
                <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="shrink-0">{TIP_EMOJI[d.tip] ?? '📁'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-quasar-black">
                        {TIP_LABEL[d.tip] ?? d.tip}
                        {d.titlu ? ` · ${d.titlu}` : ''}
                      </span>
                      {exp && <span className={`text-xs ${exp.tone}`}>{exp.text}</span>}
                    </div>
                    {d.observatii && (
                      <p className="text-xs text-quasar-gray">{d.observatii}</p>
                    )}
                  </div>
                  <a
                    href={d.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-medium text-blue-600 underline-offset-2 hover:underline"
                  >
                    Deschide ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteM.mutate(d.id)}
                    disabled={deleteM.isPending}
                    className="shrink-0 rounded p-1 text-quasar-gray hover:bg-red-50 hover:text-red-600"
                    title="Șterge documentul"
                  >
                    🗑
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-quasar-gray">Niciun document adăugat.</p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h3 className="font-display text-sm font-bold text-quasar-black">Adaugă document</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tip" htmlFor="doc-tip">
            <Select
              id="doc-tip"
              options={tipDocumentOptions}
              value={tip}
              onChange={(e) => setTip(e.target.value as Enums<'tip_document'>)}
            />
          </Field>
          <Field label="Titlu (opțional)" htmlFor="doc-titlu">
            <TextInput
              id="doc-titlu"
              placeholder="Ex: Anexă 1 / Adeverință 2026"
              value={titlu}
              onChange={(e) => setTitlu(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Link Google Drive" required htmlFor="doc-link">
          <TextInput
            id="doc-link"
            placeholder="https://drive.google.com/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </Field>
        <Field label="Expiră la (opțional)" htmlFor="doc-exp">
          <DateInput
            id="doc-exp"
            value={expirare}
            onChange={(e) => setExpirare(e.target.value)}
          />
        </Field>
        <Field label="Observații (opțional)" htmlFor="doc-obs">
          <TextArea
            id="doc-obs"
            rows={2}
            value={observatii}
            onChange={(e) => setObservatii(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" disabled={createM.isPending}>
            {createM.isPending ? 'Se adaugă…' : 'Adaugă document'}
          </Button>
        </div>
      </form>
    </div>
  )
}
