import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, DateInput, Field, TextInput } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isFrontDeskOrHigher } from '@/lib/rolesMatrix'
import { humanizeError } from '@/lib/errorMessage'
import { updateClient } from '../../../api'
import type { getClient } from '../../../api'

type Client = Awaited<ReturnType<typeof getClient>>

const todayISO = () => new Date().toISOString().slice(0, 10)

// Facturare „la cerere": marcaj „vrea factură lunară" (încasările de la data activării
// apar în /facturare → Clienți) + date PF alternative (factura iese pe alt nume + CNP).
// Datele pot veni și din portal (profil membru) — aici recepția le vede și le editează.
export function FacturareClientSection({ client }: { client: Client }) {
  const { role } = useAuth()
  const canEdit = isFrontDeskOrHigher(role)
  const queryClient = useQueryClient()

  const [facturaLunara, setFacturaLunara] = useState(client.factura_lunara ?? false)
  const [deLa, setDeLa] = useState(client.factura_lunara_de_la ?? '')
  const [pfNume, setPfNume] = useState(client.facturare_pf_nume ?? '')
  const [pfCnp, setPfCnp] = useState(client.facturare_pf_cnp ?? '')
  const [pfAdresa, setPfAdresa] = useState(client.facturare_pf_adresa ?? '')
  const [error, setError] = useState<string | null>(null)

  const firma = useQuery({
    queryKey: ['familie-firma', client.familia],
    enabled: !!client.familia,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('familii')
        .select('factura_pe_firma, firma_denumire, firma_cif')
        .eq('id', client.familia!)
        .maybeSingle()
      if (err) throw err
      return data
    },
  })

  const cnpTrimmed = pfCnp.trim()
  const cnpInvalid = cnpTrimmed !== '' && !/^\d{13}$/.test(cnpTrimmed)

  const dirty =
    facturaLunara !== (client.factura_lunara ?? false) ||
    (deLa || null) !== (client.factura_lunara_de_la ?? null) ||
    pfNume.trim() !== (client.facturare_pf_nume ?? '') ||
    cnpTrimmed !== (client.facturare_pf_cnp ?? '') ||
    pfAdresa.trim() !== (client.facturare_pf_adresa ?? '')

  const save = useMutation({
    mutationFn: () =>
      updateClient(client.id, {
        factura_lunara: facturaLunara,
        factura_lunara_de_la: facturaLunara ? deLa || todayISO() : null,
        facturare_pf_nume: pfNume.trim() || null,
        facturare_pf_cnp: cnpTrimmed || null,
        facturare_pf_adresa: pfAdresa.trim() || null,
      }),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['client', client.id] })
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const toggleFacturaLunara = (checked: boolean) => {
    setFacturaLunara(checked)
    if (checked && !deLa) setDeLa(todayISO())
    if (!checked) setDeLa('')
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-sm font-semibold text-quasar-black">Facturare</div>

      {firma.data?.factura_pe_firma && firma.data.firma_cif ? (
        <p className="mt-1 text-xs text-quasar-gray">
          Familia are <strong>factură pe firmă</strong> activată în portal:{' '}
          {firma.data.firma_denumire || '—'} (CUI {firma.data.firma_cif}). Aceasta are
          prioritate — facturile ies pe firmă, nu pe datele de mai jos.
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Checkbox
            label="Vrea factură lunară"
            checked={facturaLunara}
            onChange={(e) => toggleFacturaLunara(e.target.checked)}
            disabled={!canEdit}
          />
          {facturaLunara && (
            <Field label="De la data">
              <DateInput
                value={deLa}
                onChange={(e) => setDeLa(e.target.value)}
                disabled={!canEdit}
              />
            </Field>
          )}
        </div>
        {facturaLunara && (
          <p className="text-xs text-quasar-gray">
            Încasările de la această dată încolo apar în Facturare → „Clienți (la cerere)",
            unde recepția emite factura. Plățile dinainte nu intră.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nume pe factură (opțional)">
            <TextInput
              value={pfNume}
              placeholder="ex. altă persoană decât cursantul"
              onChange={(e) => setPfNume(e.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label="CNP">
            <TextInput
              value={pfCnp}
              placeholder="13 cifre"
              onChange={(e) => setPfCnp(e.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Adresă">
            <TextInput
              value={pfAdresa}
              onChange={(e) => setPfAdresa(e.target.value)}
              disabled={!canEdit}
            />
          </Field>
        </div>
        {cnpInvalid && <p className="text-xs text-red-700">CNP invalid — trebuie 13 cifre.</p>}
        <p className="text-xs text-quasar-gray">
          Dacă „Nume pe factură" e completat, facturile acestui client (inclusiv cele din
          plățile online) ies pe acest nume + CNP, nu pe numele cursantului.
        </p>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              disabled={!dirty || cnpInvalid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Se salvează…' : 'Salvează'}
            </Button>
            {error && <span className="text-xs text-red-700">{error}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
