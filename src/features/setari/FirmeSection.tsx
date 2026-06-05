import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Field,
  Modal,
  Spinner,
  TextInput,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'

type Firma = {
  id: string
  nume: string
  cui: string | null
  registru_comert: string | null
  capital: number | null
  observatii: string | null
}

type FormState = {
  nume: string
  cui: string
  registru_comert: string
  capital: string
  observatii: string
}

const emptyForm: FormState = {
  nume: '',
  cui: '',
  registru_comert: '',
  capital: '',
  observatii: '',
}

async function listFirme(): Promise<Firma[]> {
  const { data, error } = await supabase
    .from('organizatie_firme')
    .select('id, nume, cui, registru_comert, capital, observatii')
    .order('nume', { ascending: true })
  if (error) throw error
  return (data ?? []) as Firma[]
}

async function saveFirma(input: {
  id: string | null
  nume: string
  cui: string | null
  registru_comert: string | null
  capital: number | null
  observatii: string | null
}): Promise<void> {
  if (input.id) {
    const { error } = await supabase
      .from('organizatie_firme')
      .update({
        nume: input.nume,
        cui: input.cui,
        registru_comert: input.registru_comert,
        capital: input.capital,
        observatii: input.observatii,
      })
      .eq('id', input.id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('organizatie_firme').insert({
    nume: input.nume,
    cui: input.cui,
    registru_comert: input.registru_comert,
    capital: input.capital,
    observatii: input.observatii,
  })
  if (error) throw error
}

async function deleteFirma(id: string): Promise<void> {
  const { error } = await supabase.from('organizatie_firme').delete().eq('id', id)
  if (error) throw error
}

export function FirmeSection() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Firma | null | undefined>(undefined)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['organizatie-firme'],
    queryFn: listFirme,
  })

  const open = (f: Firma | null) => {
    setEditing(f)
    setForm(
      f
        ? {
            nume: f.nume,
            cui: f.cui ?? '',
            registru_comert: f.registru_comert ?? '',
            capital: f.capital != null ? String(f.capital) : '',
            observatii: f.observatii ?? '',
          }
        : emptyForm,
    )
    setError(null)
  }
  const close = () => setEditing(undefined)
  const isOpen = editing !== undefined
  const isEdit = Boolean(editing)
  const set =
    (key: keyof FormState) => (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['organizatie-firme'] })

  const save = useMutation({
    mutationFn: () =>
      saveFirma({
        id: editing?.id ?? null,
        nume: form.nume.trim(),
        cui: form.cui.trim() || null,
        registru_comert: form.registru_comert.trim() || null,
        capital: form.capital.trim() ? Number(form.capital) : null,
        observatii: form.observatii.trim() || null,
      }),
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteFirma(editing!.id),
    onSuccess: () => {
      void invalidate()
      close()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume.trim()) {
      setError('Numele firmei este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <section className="rounded-lg border border-quasar-gray-light bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-quasar-black">Date firmă</h2>
        <Button variant="secondary" onClick={() => open(null)}>
          + Firmă nouă
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-quasar-gray">Nicio firmă înregistrată.</p>
      ) : (
        <ul className="divide-y divide-quasar-gray-light">
          {(data ?? []).map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-baseline justify-between gap-3 py-2 text-sm"
            >
              <div>
                <strong className="text-quasar-black">{f.nume}</strong>
                {f.cui && (
                  <span className="ml-2 text-quasar-gray">CUI {f.cui}</span>
                )}
                {f.registru_comert && (
                  <span className="ml-2 text-quasar-gray">
                    {f.registru_comert}
                  </span>
                )}
                {f.capital != null && (
                  <span className="ml-2 text-quasar-gray">
                    Capital {f.capital} RON
                  </span>
                )}
              </div>
              <Button
                variant="secondary"
                className="text-xs"
                onClick={() => open(f)}
              >
                Editează
              </Button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && (
        <Modal
          open
          title={isEdit ? 'Editează firma' : 'Firmă nouă'}
          onClose={close}
          footer={
            <>
              {isEdit && (
                <Button
                  variant="danger"
                  className="mr-auto"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Șterge
                </Button>
              )}
              <Button variant="secondary" onClick={close}>
                Anulează
              </Button>
              <Button
                type="submit"
                form="firma-form"
                disabled={save.isPending}
              >
                {save.isPending ? 'Se salvează…' : 'Salvează'}
              </Button>
            </>
          }
        >
          <form id="firma-form" onSubmit={handleSubmit} className="space-y-3">
            <Field label="Nume firmă" required htmlFor="firma-nume">
              <TextInput
                id="firma-nume"
                value={form.nume}
                onChange={(e) => set('nume')(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CUI" htmlFor="firma-cui">
                <TextInput
                  id="firma-cui"
                  value={form.cui}
                  onChange={(e) => set('cui')(e.target.value)}
                />
              </Field>
              <Field label="Registru comerț" htmlFor="firma-j">
                <TextInput
                  id="firma-j"
                  placeholder="J22/654/2019"
                  value={form.registru_comert}
                  onChange={(e) => set('registru_comert')(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Capital social (RON)" htmlFor="firma-capital">
              <TextInput
                id="firma-capital"
                type="number"
                value={form.capital}
                onChange={(e) => set('capital')(e.target.value)}
              />
            </Field>
            <Field label="Observații" htmlFor="firma-obs">
              <TextInput
                id="firma-obs"
                value={form.observatii}
                onChange={(e) => set('observatii')(e.target.value)}
              />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </Modal>
      )}
    </section>
  )
}
