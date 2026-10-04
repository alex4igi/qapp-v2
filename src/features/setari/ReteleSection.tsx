import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Field, Select, Spinner, TextInput, type Column } from '@/components/ui'
import {
  asociazaRetea,
  listReteleLocatii,
  listLocatii,
  reteauaCurenta,
  stergeReteaLocatie,
  type ReteaLocatie,
} from './api'

// Pe rețeaua unei locații, cine are bara de sus pe altă locație primește la
// deschidere propunerea să treacă pe ea (SugestieLocatieRetea).
export function ReteleSection() {
  const queryClient = useQueryClient()
  const [locatieId, setLocatieId] = useState('')
  const [eticheta, setEticheta] = useState('')
  const [ip, setIp] = useState('')

  const reteleQ = useQuery({ queryKey: ['retele-locatii'], queryFn: listReteleLocatii })
  const curentaQ = useQuery({ queryKey: ['retea-curenta'], queryFn: reteauaCurenta })
  const locatiiQ = useQuery({ queryKey: ['locatii'], queryFn: listLocatii })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['retele-locatii'] })
    void queryClient.invalidateQueries({ queryKey: ['retea-curenta'] })
    void queryClient.invalidateQueries({ queryKey: ['locatia-retelei'] })
  }
  const asociaza = useMutation({
    mutationFn: () => asociazaRetea(locatieId, eticheta, ip),
    onSuccess: () => {
      setEticheta('')
      setIp('')
      refresh()
    },
  })
  const sterge = useMutation({ mutationFn: stergeReteaLocatie, onSuccess: refresh })

  const curenta = curentaQ.data
  const numeCurenta = reteleQ.data?.find((r) => r.ip === curenta?.ip)?.locatie_nume

  const columns: Column<ReteaLocatie>[] = [
    { header: 'Locație', cell: (r) => <span className="font-medium">{r.locatie_nume}</span> },
    { header: 'IP', cell: (r) => <span className="font-mono">{r.ip}</span> },
    { header: 'Notă', cell: (r) => r.eticheta ?? '—' },
    {
      header: '',
      className: 'w-24 text-right',
      cell: (r) => (
        <button
          type="button"
          className="text-xs text-danger underline"
          disabled={sterge.isPending}
          onClick={() => {
            if (confirm(`Ștergi rețeaua ${r.ip} (${r.locatie_nume})?`)) sterge.mutate(r.ip)
          }}
        >
          Șterge
        </button>
      ),
    },
  ]

  return (
    <section>
      <h2 className="mb-1 text-lg font-bold text-quasar-black">Rețelele locațiilor</h2>
      <p className="mb-3 text-sm text-quasar-gray">
        Cine deschide aplicația pe rețeaua unei locații, cu bara de sus pe altă locație, primește
        propunerea să treacă pe locația rețelei, ca banii să se înregistreze unde stă. Asocierea se
        face de pe calculatorul de la recepție sau scriind IP-ul.
      </p>

      <div className="mb-3 rounded-md border border-line bg-surface px-3 py-2 text-sm">
        Rețeaua de acum:{' '}
        {curentaQ.isLoading ? (
          '…'
        ) : curenta?.ip ? (
          <>
            <span className="font-mono">{curenta.ip}</span> —{' '}
            {numeCurenta ? <strong>{numeCurenta}</strong> : 'neasociată'}
          </>
        ) : (
          'nu se poate afla'
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Asociază cu locația">
          <Select
            placeholder="— alege locația —"
            options={(locatiiQ.data ?? []).map((l) => ({ value: l.id, label: l.nume }))}
            value={locatieId}
            onChange={(e) => setLocatieId(e.target.value)}
          />
        </Field>
        <Field label="IP (gol = rețeaua de acum)">
          <TextInput
            placeholder={curenta?.ip ?? 'ex. 86.124.55.150'}
            value={ip}
            onChange={(e) => setIp(e.target.value)}
          />
        </Field>
        <Field label="Notă (opțional)">
          <TextInput
            placeholder="ex. router recepție"
            value={eticheta}
            onChange={(e) => setEticheta(e.target.value)}
          />
        </Field>
        <Button
          onClick={() => asociaza.mutate()}
          disabled={!locatieId || (!ip.trim() && !curenta?.ip) || asociaza.isPending}
        >
          Asociază
        </Button>
      </div>

      {reteleQ.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={reteleQ.data ?? []}
          rowKey={(r) => r.ip}
          emptyMessage="Nicio rețea asociată."
        />
      )}
    </section>
  )
}
