import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DateInput, Field, Spinner, TextInput } from '@/components/ui'
import type { Vacanta } from '@/types/db'
import {
  createVacanta,
  deleteVacanta,
  listVacante,
  updateVacanta,
} from '../../api'

type Props = {
  sezonId: string
}

// Listare + adăugare + ștergere + editare vacanțe pentru un sezon.
export function VacanteTab({ sezonId }: Props) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['vacante', sezonId],
    queryFn: () => listVacante(sezonId),
  })

  const [nume, setNume] = useState('')
  const [dataInc, setDataInc] = useState('')
  const [dataFin, setDataFin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const reset = () => {
    setNume('')
    setDataInc('')
    setDataFin('')
    setEditingId(null)
    setError(null)
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['vacante', sezonId] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        sezon_id: sezonId,
        nume: nume.trim(),
        data_incepere: dataInc,
        data_final: dataFin,
      }
      return editingId ? updateVacanta(editingId, payload) : createVacanta(payload)
    },
    onSuccess: () => {
      reset()
      void invalidate()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteVacanta(id),
    onSuccess: () => void invalidate(),
  })

  const startEdit = (v: Vacanta) => {
    setEditingId(v.id)
    setNume(v.nume)
    setDataInc(v.data_incepere)
    setDataFin(v.data_final)
    setError(null)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!nume.trim() || !dataInc || !dataFin) {
      setError('Toate câmpurile sunt obligatorii.')
      return
    }
    if (dataFin < dataInc) {
      setError('Data finalului nu poate fi înainte de data începerii.')
      return
    }
    save.mutate()
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Spinner />
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-quasar-gray">Nicio vacanță înregistrată.</p>
      ) : (
        <ul className="divide-y divide-quasar-gray/30 rounded border border-quasar-gray/30">
          {(data ?? []).map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{v.nume}</span>
                <span className="ml-2 text-quasar-gray">
                  {v.data_incepere} → {v.data_final}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="text-xs"
                  onClick={() => startEdit(v)}
                >
                  Editează
                </Button>
                <Button
                  variant="danger"
                  className="text-xs"
                  onClick={() => remove.mutate(v.id)}
                >
                  Șterge
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2 border-t pt-3">
        <p className="text-sm font-semibold">
          {editingId ? 'Editează vacanță' : 'Adaugă vacanță'}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Nume">
            <TextInput
              value={nume}
              onChange={(e) => setNume(e.target.value)}
              placeholder="Vacanța de Crăciun"
            />
          </Field>
          <Field label="Început">
            <DateInput
              value={dataInc}
              onChange={(e) => setDataInc(e.target.value)}
            />
          </Field>
          <Field label="Final">
            <DateInput
              value={dataFin}
              onChange={(e) => setDataFin(e.target.value)}
            />
          </Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {editingId ? 'Salvează' : 'Adaugă'}
          </Button>
          {editingId && (
            <Button type="button" variant="secondary" onClick={reset}>
              Anulează
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
