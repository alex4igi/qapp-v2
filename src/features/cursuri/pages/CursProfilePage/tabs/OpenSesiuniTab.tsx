import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Spinner, Button, Field, TextInput, Select } from '@/components/ui'
import { useTeacheriOptions } from '@/hooks/useTeacheriOptions'
import {
  listOpenSesiuni,
  listRezervariSesiune,
  anuleazaRezervare,
  createOpenSesiune,
} from '@/features/plati/api'
import { formatData } from '../helpers'

type Props = {
  cursId: string
  canManage: boolean
  capacitateImplicita: number
}

function todayIso(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function AdaugaSesiuneForm({ cursId, capacitateImplicita }: { cursId: string; capacitateImplicita: number }) {
  const queryClient = useQueryClient()
  const teacheriQ = useTeacheriOptions()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [capacitate, setCapacitate] = useState(String(capacitateImplicita))
  const [error, setError] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('Alege data sesiunii.')
      if (data < todayIso()) throw new Error('Sesiunea nu poate fi în trecut.')
      const cap = Number(capacitate)
      if (!isFinite(cap) || cap <= 0) throw new Error('Limita de locuri trebuie să fie pozitivă.')
      return createOpenSesiune({ cursId, data, capacitate: cap, instructorId: instructorId || null })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['curs', cursId, 'open-sesiuni'] })
      setOpen(false)
      setData('')
      setInstructorId('')
      setCapacitate(String(capacitateImplicita))
      setError(null)
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Eroare la creare.'),
  })

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>+ Adaugă sesiune</Button>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Data sesiunii" required>
          <TextInput type="date" min={todayIso()} value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Instructor (opțional)">
          <Select
            placeholder="— neatribuit —"
            options={teacheriQ.data ?? []}
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
          />
        </Field>
        <Field label="Limită locuri" required>
          <TextInput
            type="number"
            min={1}
            value={capacitate}
            onChange={(e) => setCapacitate(e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>Anulează</Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? 'Se creează…' : 'Creează sesiune'}
        </Button>
      </div>
    </div>
  )
}

function RezervariList({ sesiuneId, canManage }: { sesiuneId: string; canManage: boolean }) {
  const queryClient = useQueryClient()
  const rezQ = useQuery({
    queryKey: ['open-rezervari', sesiuneId],
    queryFn: () => listRezervariSesiune(sesiuneId),
  })

  const anuleazaMut = useMutation({
    mutationFn: (rezervareId: string) => anuleazaRezervare({ rezervareId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['open-rezervari', sesiuneId] })
      void queryClient.invalidateQueries({ queryKey: ['curs'] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
    },
  })

  if (rezQ.isLoading) return <div className="p-3"><Spinner /></div>
  const rows = rezQ.data ?? []
  if (rows.length === 0) {
    return <p className="px-3 py-2 text-xs text-quasar-gray">Nicio rezervare.</p>
  }
  return (
    <ul className="divide-y divide-gray-200">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="text-quasar-black">
            {r.nume} {r.prenume ?? ''}
            {r.status === 'rezervat' && (
              <span className="ml-2 text-xs font-semibold text-amber-600">în așteptarea plății</span>
            )}
          </span>
          {canManage && (
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm('Anulezi rezervarea? Locul se eliberează (banii rămân încasați).')) {
                  anuleazaMut.mutate(r.id)
                }
              }}
              disabled={anuleazaMut.isPending}
            >
              Anulează
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function OpenSesiuniTab({ cursId, canManage, capacitateImplicita }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const sesiuniQ = useQuery({
    queryKey: ['curs', cursId, 'open-sesiuni'],
    queryFn: () => listOpenSesiuni(cursId),
  })

  const rows = sesiuniQ.data ?? []

  return (
    <div className="mt-4 space-y-3">
      {canManage && <AdaugaSesiuneForm cursId={cursId} capacitateImplicita={capacitateImplicita} />}

      {sesiuniQ.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-quasar-gray shadow-sm">
          Nicio sesiune OPEN viitoare. {canManage ? 'Adaugă una cu butonul de mai sus' : 'Se creează din „Plată nouă → Open class"'}.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => {
            const plin = s.ocupate >= s.capacitate
            const isOpen = expanded === s.id
            return (
              <div
                key={s.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-quasar-yellow/5"
                >
                  <div>
                    <span className="font-medium text-quasar-black">{formatData(s.data)}</span>
                    {s.instructor_nume && (
                      <span className="ml-2 text-sm text-quasar-gray">· {s.instructor_nume}</span>
                    )}
                    {s.status === 'anulata' && (
                      <span className="ml-2 text-xs font-semibold text-red-600">ANULATĂ</span>
                    )}
                  </div>
                  <span
                    className={[
                      'text-sm font-semibold',
                      plin ? 'text-red-600' : 'text-quasar-black',
                    ].join(' ')}
                  >
                    {s.ocupate} / {s.capacitate}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-200">
                    <RezervariList sesiuneId={s.id} canManage={canManage} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
