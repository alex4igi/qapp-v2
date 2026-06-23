import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, TextInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isFrontDeskOrHigher } from '@/lib/rolesMatrix'
import { markOptOut, clearOptOut, type OptOutEntity } from './api'

type Props = {
  entity: OptOutEntity
  id: string
  optOut: boolean
  motiv: string | null
  la: string | null
  invalidateKey: readonly unknown[]
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function OptOutSection({
  entity,
  id,
  optOut,
  motiv,
  la,
  invalidateKey,
}: Props) {
  const { role } = useAuth()
  const canEdit = isFrontDeskOrHigher(role)
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [motivInput, setMotivInput] = useState('')

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: invalidateKey })

  const markMut = useMutation({
    mutationFn: () => markOptOut(entity, id, motivInput.trim() || undefined),
    onSuccess: () => {
      void invalidate()
      setShowForm(false)
      setMotivInput('')
    },
  })

  const clearMut = useMutation({
    mutationFn: () => clearOptOut(entity, id),
    onSuccess: () => void invalidate(),
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-quasar-black">
            Comunicare marketing
          </div>
          {optOut ? (
            <div className="mt-1 space-y-0.5 text-xs text-red-700">
              <div>
                ⛔ <span className="font-medium">Opt-out</span>
                {motiv ? ` — ${motiv}` : ''}
              </div>
              {la && (
                <div className="text-quasar-gray">din {formatDate(la)}</div>
              )}
            </div>
          ) : (
            <div className="mt-1 text-xs text-emerald-700">
              ✓ Acceptă comunicare
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {optOut ? (
              <Button
                variant="secondary"
                onClick={() => clearMut.mutate()}
                disabled={clearMut.isPending}
              >
                {clearMut.isPending ? 'Se anulează…' : 'Revert opt-out'}
              </Button>
            ) : showForm ? null : (
              <Button variant="ghost" onClick={() => setShowForm(true)}>
                Marchează opt-out
              </Button>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div className="mt-3 space-y-2">
          <TextInput
            placeholder="Motiv (opțional)"
            value={motivInput}
            onChange={(e) => setMotivInput(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => markMut.mutate()}
              disabled={markMut.isPending}
            >
              {markMut.isPending ? 'Se marchează…' : 'Confirmă opt-out'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false)
                setMotivInput('')
              }}
            >
              Anulează
            </Button>
          </div>
          <p className="text-xs text-quasar-gray">
            Mesajele tranzacționale (reminder plată, confirmare programare) tot
            vor fi trimise — interes legitim al școlii. Opt-out blochează doar
            marketing/newsletter.
          </p>
        </div>
      )}
    </div>
  )
}
