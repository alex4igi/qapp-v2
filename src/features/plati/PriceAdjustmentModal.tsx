import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, TextArea, TextInput, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import type { Curs } from '@/types/db'
import { adjustEnrollmentPrice, getEnrollmentPaid, type SurplusAction } from './api'
import { derivePreviewRecurent } from './components/EnrollmentForm/helpers'

type Props = {
  enrollmentId: string
  open: boolean
  onClose: () => void
}

type EnrollmentInfo = {
  id: string
  suma: number | null
  data_incepere: string | null
  tip_plata: string | null
  nume_curs: string | null
  nume_client: string | null
  paid: number
  explicatie: ExplicatieSuma | null
}

// Ce a pus aplicația singură pe rată — ca managerul să nu refacă de mână un
// calcul care e deja făcut, sau unul pe care regula îl exclude.
type ExplicatieSuma =
  | { tip: 'facultativ' }
  | { tip: 'trupa' }
  | {
      tip: 'prorata'
      proportional: boolean
      sedinte: number
      sedinteLuna: number
      deLa: string
      suma: number
      dupaReducere: number | null
      rata: number | null
      pePerSedinta: number | null
      plafonat: boolean
    }

type CursCuSezon = Curs & {
  sezon: { data_incepere: string | null; data_final: string | null } | null
}

async function explicaSuma(row: {
  client: string | null
  suma: number | null
  data_incepere: string | null
  tip_plata: string | null
  suma_baza: number | null
  este_reinscriere: boolean | null
  cursul: CursCuSezon | null
}): Promise<ExplicatieSuma | null> {
  const curs = row.cursul
  if (!curs || row.tip_plata !== 'Per luna' || !row.data_incepere) return null
  if (curs.facultativ) return { tip: 'facultativ' }
  if (curs.nivelul === 'Trupa') return { tip: 'trupa' }

  // Prorata stă doar pe prima rată a seriei.
  const { data: prima, error } = await supabase
    .from('enrollments')
    .select('data_incepere')
    .eq('client', row.client ?? '')
    .eq('cursul', curs.id)
    .eq('tip_plata', 'Per luna')
    .lt('data_incepere', row.data_incepere)
    .limit(1)
  if (error || (prima && prima.length > 0)) return null

  const preview = derivePreviewRecurent({
    dataIncepere: row.data_incepere,
    isFacultativ: false,
    isTrupa: false,
    tipPlata: 'Per luna',
    cursSelectat: curs,
    sezonStart: curs.sezon?.data_incepere ?? null,
    sezonEnd: curs.sezon?.data_final ?? null,
    esteReinscriere: row.este_reinscriere === true,
  })
  const p = preview?.prorata
  if (!p || (p.sursaPret !== 'proportional' && p.sursaPret !== 'sedinta')) return null
  // Suma a fost schimbată între timp (ajustare, voucher) — nu mai e calculul aplicației.
  if (row.suma_baza !== p.suma) return null
  const proportional = p.sursaPret === 'proportional'
  const rata = proportional ? p.rata : null
  return {
    tip: 'prorata',
    proportional,
    sedinte: p.sedinte,
    sedinteLuna: p.sedinteLuna,
    deLa: row.data_incepere,
    suma: p.suma,
    dupaReducere: row.suma != null && row.suma !== p.suma ? row.suma : null,
    rata,
    pePerSedinta: proportional
      ? Math.round(p.rata / p.sedinteLuna)
      : curs.pret_sedinta,
    plafonat: p.sursaPret === 'sedinta' && p.plafonat,
  }
}

async function fetchEnrollmentInfo(id: string): Promise<EnrollmentInfo> {
  const { data, error } = await supabase
    .from('enrollments')
    .select(
      'id, client, suma, suma_baza, este_reinscriere, data_incepere, tip_plata, cursul(*, sezon(data_incepere, data_final)), client_info:client(nume, prenume)',
    )
    .eq('id', id)
    .single()
  if (error) throw error
  const row = data as unknown as {
    id: string
    client: string | null
    suma: number | null
    suma_baza: number | null
    este_reinscriere: boolean | null
    data_incepere: string | null
    tip_plata: string | null
    cursul: CursCuSezon | null
    client_info: { nume: string | null; prenume: string | null } | null
  }
  const [paid, explicatie] = await Promise.all([
    getEnrollmentPaid(id),
    explicaSuma(row).catch(() => null),
  ])
  return {
    id: row.id,
    suma: row.suma,
    data_incepere: row.data_incepere,
    tip_plata: row.tip_plata,
    nume_curs: row.cursul?.numele ?? null,
    nume_client: row.client_info
      ? `${row.client_info.nume ?? ''} ${row.client_info.prenume ?? ''}`.trim()
      : null,
    paid,
    explicatie,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function PriceAdjustmentModal({ enrollmentId, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [newSuma, setNewSuma] = useState('')
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)
  // La surplus, implicit lăsăm creditul în cont; alocarea la altă datorie se face
  // ulterior din profil („Folosește credit"). Aici doar credit vs restituire.
  const [surplusAction, setSurplusAction] = useState<SurplusAction>('credit')

  const infoQ = useQuery({
    queryKey: ['enrollment-info', enrollmentId],
    queryFn: () => fetchEnrollmentInfo(enrollmentId),
    enabled: open,
  })

  const paid = infoQ.data?.paid ?? 0
  const n = Number(newSuma)
  const surplus = Number.isFinite(n) && n >= 0 ? round2(paid - n) : 0
  const hasSurplus = surplus > 0.004

  useEffect(() => {
    if (open && infoQ.data) setNewSuma(String(infoQ.data.suma ?? ''))
    if (!open) {
      setNewSuma('')
      setMotiv('')
      setError(null)
      setSurplusAction('credit')
    }
  }, [open, infoQ.data])

  const save = useMutation({
    mutationFn: () =>
      adjustEnrollmentPrice({
        enrollmentId,
        newSuma: n,
        motiv,
        surplusAction: hasSurplus ? surplusAction : 'none',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['client-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['client-credit'] })
      void queryClient.invalidateQueries({ queryKey: ['plati-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({
        queryKey: ['enrollment-info', enrollmentId],
      })
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!Number.isFinite(n) || n < 0) {
      setError('Sumă invalidă.')
      return
    }
    if (!motiv.trim()) {
      setError('Motivul e obligatoriu.')
      return
    }
    save.mutate()
  }

  const radio = (value: SurplusAction) => ({
    type: 'radio' as const,
    name: 'surplus-action',
    checked: surplusAction === value,
    onChange: () => setSurplusAction(value),
    className: 'mt-0.5',
  })

  return (
    <Modal
      open={open}
      title="Ajustează preț înrolare"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="price-adjust-form"
            disabled={save.isPending || infoQ.isLoading}
          >
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      {infoQ.isLoading ? (
        <Spinner />
      ) : infoQ.isError ? (
        <p className="text-sm text-red-600">
          {humanizeError(infoQ.error, 'Eroare la încărcare.')}
        </p>
      ) : (
        <form id="price-adjust-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-quasar-gray">Cursant:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.nume_client ?? '—'}
              </strong>
            </p>
            <p>
              <span className="text-quasar-gray">Curs:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.nume_curs ?? '—'}
              </strong>
            </p>
            <p>
              <span className="text-quasar-gray">Tip plată:</span>{' '}
              {infoQ.data?.tip_plata ?? '—'}
            </p>
            <p>
              <span className="text-quasar-gray">Sumă actuală:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.suma ?? 0} RON
              </strong>{' '}
              <span className="text-quasar-gray">· încasat:</span>{' '}
              <strong className="text-quasar-black">{paid} RON</strong>
            </p>
          </div>

          {infoQ.data?.explicatie && (
            <ExplicatieBox e={infoQ.data.explicatie} />
          )}

          <Field label="Sumă nouă (RON)" required htmlFor="adj-suma">
            <TextInput
              id="adj-suma"
              type="number"
              min={0}
              step="1"
              value={newSuma}
              onChange={(e) => setNewSuma(e.target.value)}
            />
          </Field>

          <Field label="Motiv ajustare" required htmlFor="adj-motiv">
            <TextArea
              id="adj-motiv"
              rows={3}
              placeholder="Ex: Reducere pentru circumstanțe speciale convenite cu părintele…"
              value={motiv}
              onChange={(e) => setMotiv(e.target.value)}
            />
          </Field>

          {hasSurplus && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">
                Rezultă un surplus de {surplus} RON
              </p>
              <p className="text-xs text-quasar-gray">
                S-au încasat {paid} RON, iar suma nouă e {n} RON. Ce faci cu
                surplusul?
              </p>

              <label className="flex items-start gap-2 text-sm">
                <input {...radio('credit')} />
                <span className="flex-1 font-medium text-quasar-black">
                  Lasă drept credit în cont ({surplus} RON)
                  <span className="block text-xs font-normal text-quasar-gray">
                    Rămâne credit în favoarea clientului, vizibil pe profil. Îl
                    poți aloca ulterior la o plată/datorie („Folosește credit").
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input {...radio('refund')} />
                <span className="flex-1 font-medium text-quasar-black">
                  Restituie banii ({surplus} RON)
                  <span className="block text-xs font-normal text-quasar-gray">
                    Se înregistrează o restituire; restul devine 0.
                  </span>
                </span>
              </label>
            </div>
          )}

          <p className="text-xs text-quasar-gray">
            Modificarea se înregistrează în jurnalul de audit (cine, când, de ce).
            {!hasSurplus &&
              ' Suma se aplică pe înrolare; plățile deja înregistrate rămân neschimbate.'}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}

function ExplicatieBox({ e }: { e: ExplicatieSuma }) {
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
      {e.tip === 'facultativ' && (
        <p>
          ℹ️ <strong>Facultativ lunar — fără prorata.</strong> Luna se plătește întreagă,
          indiferent de ziua înscrierii: plata lunară dă acces la toate ședințele din lună.
        </p>
      )}
      {e.tip === 'trupa' && (
        <p>
          ℹ️ <strong>Trupă — fără prorata.</strong> Contractul e pe tot sezonul, rata e mereu întreagă.
        </p>
      )}
      {e.tip === 'prorata' && (
        <>
          <p>
            ✅ <strong>Prorata e deja calculată de aplicație:</strong> de la{' '}
            {formatDate(e.deLa)} prinde <strong>{e.sedinte}</strong> din {e.sedinteLuna}{' '}
            ședințe {e.proportional ? 'de la startul sezonului' : 'ale lunii'} ={' '}
            <strong>{e.suma} RON</strong>
            {e.plafonat && ' (plafonat la rata lunii)'}
            {e.dupaReducere != null && `, ${e.dupaReducere} RON după reducere`}.
          </p>
          {e.pePerSedinta != null && (
            <p className="mt-1 text-xs">
              {e.proportional
                ? `În septembrie, prețul pe ședință = rata ÷ ședințele grupei de la start: ${e.rata} ÷ ${e.sedinteLuna} = ${e.pePerSedinta} RON. Diferă de la grupă la grupă (45 e doar la cele cu 6 ședințe).`
                : `Preț pe ședință din contract: ${e.pePerSedinta} RON.`}{' '}
              Ajustează doar dacă e alt motiv decât prorata.
            </p>
          )}
        </>
      )}
    </div>
  )
}
