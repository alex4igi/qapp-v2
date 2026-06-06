import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Spinner, Button } from '@/components/ui'
import {
  listOpenSesiuni,
  listRezervariSesiune,
  anuleazaRezervare,
} from '@/features/plati/api'
import { formatData } from '../helpers'

type Props = {
  cursId: string
  canManage: boolean
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
    <ul className="divide-y divide-quasar-gray-light">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="text-quasar-black">
            {r.nume} {r.prenume ?? ''}
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

export function OpenSesiuniTab({ cursId, canManage }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const sesiuniQ = useQuery({
    queryKey: ['curs', cursId, 'open-sesiuni'],
    queryFn: () => listOpenSesiuni(cursId),
  })

  if (sesiuniQ.isLoading) return <div className="mt-4"><Spinner /></div>
  const rows = sesiuniQ.data ?? []
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-quasar-gray-light bg-white p-6 text-center text-sm text-quasar-gray">
        Nicio sesiune OPEN viitoare. Se creează la prima rezervare din „Plată nouă → Open class".
      </p>
    )
  }

  return (
    <div className="mt-4 space-y-2">
      {rows.map((s) => {
        const plin = s.ocupate >= s.capacitate
        const isOpen = expanded === s.id
        return (
          <div
            key={s.id}
            className="overflow-hidden rounded-lg border border-quasar-gray-light bg-white"
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
              <div className="border-t border-quasar-gray-light">
                <RezervariList sesiuneId={s.id} canManage={canManage} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
