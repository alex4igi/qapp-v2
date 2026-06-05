import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Button,
  Spinner,
  TextInput,
  Checkbox,
} from '@/components/ui'
import {
  assignClientiToFamilie,
  listClientiForFamilieAssign,
} from './api'

type Props = {
  open: boolean
  familieId: string
  familieNume: string
  onClose: () => void
}

export function AddMembersModal({ open, familieId, familieNume, onClose }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const clientiQ = useQuery({
    queryKey: ['clienti-for-familie-assign'],
    queryFn: listClientiForFamilieAssign,
    enabled: open,
  })

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (clientiQ.data ?? [])
      .filter((c) => c.familia !== familieId) // ascunde cei deja în familia asta
      .filter((c) => {
        if (!term) return true
        const label = `${c.nume} ${c.prenume ?? ''}`.toLowerCase()
        return label.includes(term)
      })
  }, [clientiQ.data, familieId, search])

  // Avertizare: dacă ai bifat clienți care sunt deja în altă familie
  const movedFromOther = useMemo(() => {
    return candidates.filter((c) => selected.has(c.id) && c.familia)
  }, [candidates, selected])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = useMutation({
    mutationFn: () =>
      assignClientiToFamilie({
        clientIds: Array.from(selected),
        familieId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['familie', familieId] })
      void queryClient.invalidateQueries({ queryKey: ['familie'] })
      void queryClient.invalidateQueries({ queryKey: ['familie-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['clienti'] })
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['client-familia'] })
      void queryClient.invalidateQueries({
        queryKey: ['clienti-for-familie-assign'],
      })
      setSelected(new Set())
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la asociere.'),
  })

  const handleConfirm = () => {
    setError(null)
    if (selected.size === 0) {
      setError('Selectează cel puțin un client.')
      return
    }
    if (movedFromOther.length > 0) {
      const names = movedFromOther
        .map((c) => `${c.nume} ${c.prenume ?? ''} (din ${c.familia_nume})`)
        .join(', ')
      if (
        !window.confirm(
          `Următorii clienți vor fi MUTAȚI din familia lor curentă în Familia ${familieNume}:\n\n${names}\n\nContinui?`,
        )
      ) {
        return
      }
    }
    submit.mutate()
  }

  return (
    <Modal
      open={open}
      title={`Adaugă membri în Familia ${familieNume}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={handleConfirm} disabled={submit.isPending}>
            {submit.isPending
              ? 'Se asociază…'
              : `Asociază (${selected.size})`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextInput
          placeholder="Caută după nume…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {clientiQ.isLoading ? (
          <Spinner />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-quasar-gray">Niciun client găsit.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-quasar-gray-light overflow-y-auto rounded-md border border-quasar-gray-light">
            {candidates.map((c) => (
              <li key={c.id} className="px-3 py-2">
                <Checkbox
                  id={`mem-${c.id}`}
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  label={
                    <span>
                      <span className="text-quasar-black">
                        {c.nume} {c.prenume ?? ''}
                      </span>
                      {c.familia_nume && (
                        <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          deja în {c.familia_nume}
                        </span>
                      )}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
