import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, DateInput, TextInput, Select, Button, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { computeOraFinal, computePret, type TarifBracket } from '@/lib/inchirieriPricing'
import {
  adjustInchirierePrice,
  cancelInchiriere,
  checkInchiriereConflict,
  getInchiriereDetail,
  listTarifeInchiriere,
  updateInchiriere,
} from '@/features/plati/api'

const DURATE = [30, 60, 90, 120, 150, 180, 210, 240]

type Props = {
  inchiriereId: string
  onClose: () => void
}

export function EditInchiriereModal({ inchiriereId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [data, setData] = useState('')
  const [oraStart, setOraStart] = useState('')
  const [durataMin, setDurataMin] = useState(60)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const detailQ = useQuery({
    queryKey: ['inchiriere-detail', inchiriereId],
    queryFn: () => getInchiriereDetail(inchiriereId),
  })
  const d = detailQ.data

  useEffect(() => {
    if (!d) return
    setData(d.data)
    setOraStart(d.ora_start.slice(0, 5))
    setDurataMin(d.durata_min)
  }, [d])

  const oraFinal = computeOraFinal(oraStart, durataMin)

  const conflictQ = useQuery({
    queryKey: ['inchiriere-conflict', d?.sala, data, oraStart, durataMin, inchiriereId],
    queryFn: () =>
      checkInchiriereConflict({
        sala: d!.sala,
        data,
        oraStart,
        durataMin,
        excludeId: inchiriereId,
      }),
    enabled: Boolean(d?.sala && data && oraStart && durataMin),
  })
  const conflict = conflictQ.data ?? null

  // Recalcul preț: durata schimbă treapta de tarif. Închirierile gratis (pret 0 —
  // antrenament staff) rămân gratis. tier + sala sunt fixe (nu se editează aici).
  const tarifeQ = useQuery({ queryKey: ['tarife-inchiriere'], queryFn: listTarifeInchiriere })
  const isFree = !d?.pret
  const tarif = useMemo<TarifBracket | null>(
    () => tarifeQ.data?.find((t) => t.sala === d?.sala && t.tier === d?.tier) ?? null,
    [tarifeQ.data, d?.sala, d?.tier],
  )
  const newPret = isFree ? 0 : computePret(tarif, durataMin)
  const pretLipsa = !isFree && newPret == null // treaptă neconfigurată pt noua durată
  const priceChanged = !isFree && newPret != null && newPret !== d?.pret

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['inchirieri'] })
    void queryClient.invalidateQueries({ queryKey: ['plati'] })
    void queryClient.invalidateQueries({ queryKey: ['datorii'] })
  }

  const move = useMutation({
    mutationFn: async () => {
      if (conflict) throw new Error('Interval ocupat — alege alt slot.')
      if (pretLipsa) throw new Error('Tarif neconfigurat pentru această durată.')
      await updateInchiriere(inchiriereId, { data, oraStart, durataMin })
      if (priceChanged && newPret != null) {
        return await adjustInchirierePrice(inchiriereId, newPret)
      }
      return null
    },
    onSuccess: (res) => {
      invalidate()
      // Teacher/guest n-au cont → diferența de bani se reglează manual din Plăți.
      if (res && !res.has_account && Math.abs(res.rest) > 0.004) {
        const dif = formatRON(Math.abs(res.rest))
        alert(
          res.rest > 0
            ? `Prețul a crescut. Chiriașul (fără cont) mai are de plată ${dif} — încaseaz-o din Plăți.`
            : `Prețul a scăzut. Chiriașul (fără cont) a plătit ${dif} în plus — fă restituirea din Plăți.`,
        )
      }
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => cancelInchiriere(inchiriereId),
    onSuccess: (res) => {
      invalidate()
      if (res.hadPayments) {
        alert('Închirierea a fost anulată. Există încasări pe ea — fă refund-ul manual din Plăți.')
      }
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la anulare.')),
  })

  const renterName = d?.teacher_rel
    ? `${d.teacher_rel.nume ?? ''} ${d.teacher_rel.prenume ?? ''}`.trim()
    : d?.client_rel
      ? `${d.client_rel.nume ?? ''} ${d.client_rel.prenume ?? ''}`.trim()
      : (d?.guest_nume ?? '—')
  const tierLabel = !d?.pret ? 'Gratis' : d.tier === 'staff' ? 'Staff' : 'Client'

  return (
    <Modal
      open
      title="Închiriere"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="danger"
            className="mr-auto"
            disabled={remove.isPending}
            onClick={() => (confirmCancel ? remove.mutate() : setConfirmCancel(true))}
          >
            {confirmCancel ? 'Sigur anulezi?' : 'Anulează închirierea'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Închide
          </Button>
          <Button
            onClick={() => move.mutate()}
            disabled={move.isPending || Boolean(conflict) || pretLipsa}
          >
            {move.isPending ? 'Se salvează…' : 'Salvează mutarea'}
          </Button>
        </>
      }
    >
      {detailQ.isLoading || !d ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-line bg-surface p-3 text-sm">
            <div className="font-semibold text-ink">
              {d.sala_rel?.nume ?? '—'} · tarif {tierLabel} ·{' '}
              {d.pret ? formatRON(d.pret) : '0 lei'}
            </div>
            <div className="text-muted">
              {renterName} · status {d.status_plata}
              {d.guest_tel ? ` · ${d.guest_tel}` : ''}
            </div>
            {d.observatii && <div className="mt-1 text-muted">{d.observatii}</div>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">
              <DateInput value={data} onChange={(e) => setData(e.target.value)} />
            </Field>
            <Field label="Ora start">
              <TextInput
                type="time"
                step={1800}
                value={oraStart}
                onChange={(e) => setOraStart(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Durată">
            <div className="flex items-center gap-2">
              <Select
                className="w-40"
                options={DURATE.map((x) => ({ value: String(x), label: `${x} min` }))}
                value={String(durataMin)}
                onChange={(e) => setDurataMin(Number(e.target.value))}
              />
              {oraFinal && (
                <span className="text-sm text-muted">
                  → {oraStart}–{oraFinal}
                </span>
              )}
            </div>
          </Field>

          {priceChanged && newPret != null && (
            <p className="rounded-md border border-warn/40 bg-warn/10 p-2 text-sm text-ink">
              Preț recalculat: <span className="font-semibold">{formatRON(newPret)}</span>{' '}
              <span className="text-muted">(era {formatRON(d.pret ?? 0)})</span>
              {d.client && (
                <span className="text-muted">
                  {' '}· diferența se reglează automat pe contul clientului
                </span>
              )}
            </p>
          )}

          {pretLipsa && (
            <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm font-medium text-danger">
              Tarif neconfigurat pentru {durataMin} min pe această sală — nu pot recalcula prețul.
            </p>
          )}

          {conflict && (
            <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm font-medium text-danger">
              Interval ocupat — {conflict.kind === 'curs' ? 'curs' : 'închiriere'}: {conflict.label}{' '}
              ({conflict.ora_start}–{conflict.ora_final})
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
