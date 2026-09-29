import { useEffect, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, TextInput } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { getApeluriZi, upsertApeluriZi } from './api'

type Props = {
  data: string
  locatieId: string
  locatieNume: string
}

const intreg = (v: string) => Math.max(0, Math.round(Number(v) || 0))

/**
 * Sursa „telefon" a K4 la recepție: seara, din istoricul de apeluri al mobilului.
 * Luna se adună singură în raportul KPI.
 */
export function ApeluriPierduteCard({ data, locatieId, locatieNume }: Props) {
  const queryClient = useQueryClient()
  const q = useQuery({
    queryKey: ['apeluri-zi', data, locatieId],
    queryFn: () => getApeluriZi(data, locatieId),
  })

  const [pierdute, setPierdute] = useState('')
  const [returnate, setReturnate] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPierdute(q.data ? String(q.data.pierdute) : '')
    setReturnate(q.data ? String(q.data.returnate) : '')
    setSaved(Boolean(q.data))
    setError(null)
  }, [q.data])

  const p = intreg(pierdute)
  const r = intreg(returnate)
  const invalid = r > p

  const mut = useMutation({
    mutationFn: () => upsertApeluriZi(data, locatieId, { pierdute: p, returnate: r }),
    onSuccess: () => {
      setSaved(true)
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['apeluri-zi'] })
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const schimba = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    setSaved(false)
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-quasar-black">
          Apeluri pierdute —{' '}
          <span className="font-normal text-quasar-gray">
            {locatieNume} · {data}
          </span>
        </h2>
        {saved && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            ✓ Salvat
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-quasar-gray">
        La finalul zilei, din istoricul de apeluri al telefonului recepției. Dacă n-ai avut niciun
        apel pierdut, trece 0 și salvează.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="Apeluri pierdute" htmlFor="apeluri-pierdute">
            <TextInput
              id="apeluri-pierdute"
              type="number"
              min={0}
              step={1}
              value={pierdute}
              onChange={schimba(setPierdute)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Din care sunate înapoi azi" htmlFor="apeluri-returnate">
            <TextInput
              id="apeluri-returnate"
              type="number"
              min={0}
              step={1}
              value={returnate}
              onChange={schimba(setReturnate)}
            />
          </Field>
        </div>
        <Button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || invalid || pierdute === '' || returnate === ''}
        >
          {mut.isPending ? 'Se salvează…' : 'Salvează'}
        </Button>
      </div>

      {invalid && (
        <p className="mt-2 text-xs text-red-700">Nu poți suna înapoi mai multe apeluri decât ai pierdut.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}
