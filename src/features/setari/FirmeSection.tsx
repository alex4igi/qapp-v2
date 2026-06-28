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
  ibans: string[] | null
  serie: string | null
  cota_tva: number | null
  factureaza: boolean
  auto_factura_portal: boolean
}

type FormState = {
  nume: string
  cui: string
  registru_comert: string
  capital: string
  observatii: string
  ibans: string
  serie: string
  cota_tva: string
  factureaza: boolean
  auto_factura_portal: boolean
}

const emptyForm: FormState = {
  nume: '',
  cui: '',
  registru_comert: '',
  capital: '',
  observatii: '',
  ibans: '',
  serie: '',
  cota_tva: '0',
  factureaza: false,
  auto_factura_portal: false,
}

async function listFirme(): Promise<Firma[]> {
  const { data, error } = await supabase
    .from('organizatie_firme')
    .select(
      'id, nume, cui, registru_comert, capital, observatii, ibans, serie, cota_tva, factureaza, auto_factura_portal',
    )
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
  ibans: string[]
  serie: string | null
  cota_tva: number
  factureaza: boolean
  auto_factura_portal: boolean
}): Promise<void> {
  const payload = {
    nume: input.nume,
    cui: input.cui,
    registru_comert: input.registru_comert,
    capital: input.capital,
    observatii: input.observatii,
    ibans: input.ibans,
    serie: input.serie,
    cota_tva: input.cota_tva,
    factureaza: input.factureaza,
    auto_factura_portal: input.auto_factura_portal,
  }
  if (input.id) {
    const { error } = await supabase
      .from('organizatie_firme')
      .update(payload)
      .eq('id', input.id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('organizatie_firme').insert(payload)
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
            ibans: (f.ibans ?? []).join(', '),
            serie: f.serie ?? '',
            cota_tva: f.cota_tva != null ? String(f.cota_tva) : '0',
            factureaza: f.factureaza ?? false,
            auto_factura_portal: f.auto_factura_portal ?? false,
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
        ibans: form.ibans
          .split(',')
          .map((s) => s.replace(/\s/g, ''))
          .filter(Boolean),
        serie: form.serie.trim() || null,
        cota_tva: form.cota_tva.trim() ? Number(form.cota_tva) : 0,
        factureaza: form.factureaza,
        auto_factura_portal: form.auto_factura_portal,
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

            <div className="mt-2 border-t border-quasar-gray-light pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-quasar-gray">
                Facturare FGO
              </p>
              <Field
                label="IBAN-uri (separate prin virgulă)"
                htmlFor="firma-ibans"
              >
                <TextInput
                  id="firma-ibans"
                  placeholder="RO85INGB0000999914989082"
                  value={form.ibans}
                  onChange={(e) => set('ibans')(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Serie facturi" htmlFor="firma-serie">
                  <TextInput
                    id="firma-serie"
                    placeholder="QDS"
                    value={form.serie}
                    onChange={(e) => set('serie')(e.target.value)}
                  />
                </Field>
                <Field label="Cotă TVA (%)" htmlFor="firma-tva">
                  <TextInput
                    id="firma-tva"
                    type="number"
                    value={form.cota_tva}
                    onChange={(e) => set('cota_tva')(e.target.value)}
                  />
                </Field>
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm text-quasar-black">
                <input
                  type="checkbox"
                  checked={form.factureaza}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, factureaza: e.target.checked }))
                  }
                />
                Are cheie API FGO (poate emite din extras)
              </label>
              <label className="mt-1 flex items-center gap-2 text-sm text-quasar-black">
                <input
                  type="checkbox"
                  checked={form.auto_factura_portal}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      auto_factura_portal: e.target.checked,
                    }))
                  }
                />
                Emite automat factura la plata din portal
              </label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </Modal>
      )}
    </section>
  )
}
