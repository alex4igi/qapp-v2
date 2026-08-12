import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Badge, Spinner, DataTable, type Column, type BadgeTone } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { formatDate } from '@/lib/format'
import type { SesiuneEvaluare } from '@/types/db'
import { sezonActivId } from '@/lib/lookups'
import {
  listSesiuni,
  genereazaRundeSezon,
  deleteSesiune,
  trimiteAprobate,
  inchideSesiune,
  STARE_SESIUNE_LABEL,
  type StareSesiune,
} from '../flowApi'
import { SesiuneForm } from './SesiuneForm'

const TON: Record<StareSesiune, BadgeTone> = {
  ciorna: 'neutral',
  deschisa: 'brand',
  verificare: 'warn',
  trimisa: 'success',
  inchisa: 'neutral',
  anulata: 'danger',
}

export function SesiuniTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState<{ open: boolean; sesiune?: SesiuneEvaluare | null }>({
    open: false,
  })
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [eroare, setEroare] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['evaluari', 'sesiuni'], queryFn: listSesiuni })
  const sezonQ = useQuery({ queryKey: ['lookup', 'sezon-activ'], queryFn: sezonActivId })
  const invalideaza = () => qc.invalidateQueries({ queryKey: ['evaluari'] })

  const trimite = useMutation({
    mutationFn: (id: string) => trimiteAprobate(id),
    onSuccess: (n) => {
      void invalideaza()
      setEroare(null)
      setMesaj(
        n === 0
          ? 'Nimic de trimis — nicio evaluare aprobată în așteptare.'
          : `${n} ${n === 1 ? 'evaluare a plecat' : 'evaluări au plecat'} spre părinți.`,
      )
    },
    onError: (e) => setEroare(humanizeError(e, 'Eroare la trimitere.')),
  })

  const inchide = useMutation({
    mutationFn: (id: string) => inchideSesiune(id),
    onSuccess: (r) => {
      void invalideaza()
      setEroare(null)
      setMesaj(
        `Runda s-a închis: ${r.trimise} trimise, ${r.expirate} expirate (nu ajung la părinți).`,
      )
    },
    onError: (e) => setEroare(humanizeError(e, 'Eroare la închidere.')),
  })

  // Sezoanele clonate după acest feature primesc rundele automat. Butonul e pentru
  // sezonul curent, creat înainte — sau creat manual, în afara wizardului.
  const genereaza = useMutation({
    mutationFn: () => genereazaRundeSezon(sezonQ.data!),
    onSuccess: (n) => {
      void invalideaza()
      setEroare(null)
      setMesaj(
        n === 0
          ? 'Sezonul activ are deja runde (sau e sezon extra, care nu primește automat).'
          : `${n} runde create ca ciorne — verifică datele și grupele, apoi lasă-le să curgă.`,
      )
    },
    onError: (e) => setEroare(humanizeError(e, 'Eroare la generare.')),
  })

  const sterge = useMutation({
    mutationFn: (id: string) => deleteSesiune(id),
    onSuccess: () => void invalideaza(),
    onError: (e) => setEroare(humanizeError(e, 'Eroare la ștergere.')),
  })

  const columns: Column<SesiuneEvaluare>[] = [
    {
      header: 'Runda',
      cell: (s) => <span className="font-medium text-ink">{s.nume}</span>,
      sortValue: (s) => s.nume.toLowerCase(),
    },
    {
      header: 'Stare',
      cell: (s) => (
        <Badge tone={TON[s.stare as StareSesiune]}>
          {STARE_SESIUNE_LABEL[s.stare as StareSesiune]}
        </Badge>
      ),
      className: 'w-32',
    },
    {
      header: 'Termen instructori',
      cell: (s) => formatDate(s.data_limita_teacher),
      className: 'w-36',
      sortValue: (s) => s.data_limita_teacher,
    },
    {
      header: 'Trimitere',
      cell: (s) => formatDate(s.data_trimitere),
      className: 'w-32',
      sortValue: (s) => s.data_trimitere,
    },
    {
      header: 'Închidere',
      cell: (s) => formatDate(s.data_inchidere),
      className: 'w-32',
      sortValue: (s) => s.data_inchidere,
    },
    {
      header: '',
      cell: (s) => {
        const activa = s.stare === 'deschisa' || s.stare === 'verificare'
        return (
          <div className="flex justify-end gap-1">
            {activa && (
              <>
                <Button variant="ghost" onClick={() => trimite.mutate(s.id)}>
                  Trimite aprobatele
                </Button>
                <Button variant="ghost" onClick={() => inchide.mutate(s.id)}>
                  Închide
                </Button>
              </>
            )}
            {s.stare === 'ciorna' && (
              <Button variant="ghost" onClick={() => sterge.mutate(s.id)}>
                Șterge
              </Button>
            )}
          </div>
        )
      },
      className: 'w-64',
    },
  ]

  if (isLoading) return <Spinner />

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-2">
          O rundă strânge evaluările, le trece prin verificare și le trimite la părinți
          la data stabilită. Doar ce aprobi pleacă.
        </p>
        <div className="flex shrink-0 gap-2">
          {(data ?? []).length === 0 && sezonQ.data && (
            <Button
              variant="secondary"
              disabled={genereaza.isPending}
              onClick={() => genereaza.mutate()}
            >
              {genereaza.isPending ? 'Se generează…' : 'Generează rundele sezonului'}
            </Button>
          )}
          <Button onClick={() => setForm({ open: true, sesiune: null })}>+ Rundă nouă</Button>
        </div>
      </div>

      {mesaj && (
        <p className="mb-3 rounded-md bg-success-bg px-3 py-2 text-sm text-success">{mesaj}</p>
      )}
      {eroare && (
        <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{eroare}</p>
      )}

      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(s) => s.id}
        onRowClick={(s) => setForm({ open: true, sesiune: s })}
        emptyMessage="Nicio rundă de evaluare. Creează prima."
      />

      {form.open && (
        <SesiuneForm sesiune={form.sesiune} onClose={() => setForm({ open: false })} />
      )}
    </div>
  )
}
