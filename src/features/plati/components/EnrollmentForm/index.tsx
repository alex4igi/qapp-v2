import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  DateInput,
  Select,
  Combobox,
  Checkbox,
  Button,
  Spinner,
  type SelectOption,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { clientiOptions, sezonActiv } from '@/lib/lookups'
import type { Curs, Enums } from '@/types/db'
import { listAvailableVouchere } from '@/features/vouchere/api'
import { getCursOcupare } from '@/features/cursuri/api/profile'
import { EligibilityAlerts } from '@/features/vouchere/EligibilityAlerts'
import {
  createInrolari,
  getCursForInrolare,
  getOpenSesiuneByDate,
  listCursuriPentruInrolare,
  previewPoolDiscount,
  scheduleConfirmareInrolare,
} from '../../api'
import {
  TIP_LABEL,
  TIP_ORDER,
  derivePreviewRecurent,
  deriveTip,
  todayIso,
} from './helpers'
import { PriceSummary } from './PriceSummary'
import { RecurentPreview } from './RecurentPreview'

type Props = {
  open: boolean
  onClose: () => void
  defaultClientId?: string
  defaultCursId?: string
}

export function EnrollmentForm({
  open,
  onClose,
  defaultClientId,
  defaultCursId,
}: Props) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const isAdmin = isAdminOrHigher(role)
  const { locatieId, locatieNume } = useWorkingLocatie()
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [cursId, setCursId] = useState(defaultCursId ?? '')
  const [tipPlata, setTipPlata] = useState<Enums<'tip_plata'>>('Per luna')
  const [dataIncepere, setDataIncepere] = useState(todayIso())
  const [voucherId, setVoucherId] = useState('')
  const [forceReinrolare, setForceReinrolare] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientiQ = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
  })

  // Cheie distinctă de `['lookup','sezon-activ']`: aceea e populată de `sezonActivId`
  // (string), pe când aici folosim `sezonActiv` (obiect cu .id + date). Aceeași cheie
  // = coliziune de cache → uneori `data` era string, `.id` ieșea undefined și lista de
  // cursuri apărea NEfiltrată pe sezon (bug intermitent refresh-to-refresh).
  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ-full'],
    queryFn: sezonActiv,
  })

  const cursuriQ = useQuery<Curs[]>({
    queryKey: ['cursuri-pentru-inrolare', locatieId, sezonActivQ.data?.id ?? null],
    queryFn: () =>
      listCursuriPentruInrolare(locatieId, sezonActivQ.data?.id ?? null),
    enabled: sezonActivQ.isSuccess,
  })

  // Dacă deschidem modalul cu un curs prestabilit care nu e la locația
  // curentă, îl aducem separat ca să apară totuși ca opțiune.
  const defaultCursQ = useQuery<Curs>({
    queryKey: ['curs-pentru-inrolare-default', defaultCursId],
    queryFn: () => getCursForInrolare(defaultCursId!),
    enabled: Boolean(defaultCursId),
  })

  const cursuri = useMemo(() => {
    const list = cursuriQ.data ?? []
    const fallback = defaultCursQ.data
    if (fallback && !list.some((c) => c.id === fallback.id)) {
      return [fallback, ...list]
    }
    return list
  }, [cursuriQ.data, defaultCursQ.data])

  const cursSelectat = useMemo(
    () => cursuri.find((c) => c.id === cursId) ?? null,
    [cursuri, cursId],
  )

  const tipInrolare = deriveTip(cursSelectat)
  const isFacultativ = tipInrolare === 'facultativ'
  const isTrupa = tipInrolare === 'recurent-trupa'

  // Avertisment soft: la cursurile recurente nu se pot înscrie mai mulți decât
  // capacitatea sălii. Nu blocăm (override permis), doar semnalăm.
  const ocupareQ = useQuery({
    queryKey: ['curs-ocupare-inrolare', cursId],
    queryFn: () => getCursOcupare(cursId),
    enabled: Boolean(cursId) && Boolean(cursSelectat) && !isFacultativ,
  })
  const cursPlin =
    !isFacultativ &&
    ocupareQ.data != null &&
    ocupareQ.data.capacitate != null &&
    ocupareQ.data.activi >= ocupareQ.data.capacitate

  // Facultativ per ședință: capacitatea e per-sesiune (curs + dată), exact ca în
  // fluxul Open class. Cheia de query e comună cu OpenClassTab → cache partajat.
  const isFacultativPerSedinta = isFacultativ && tipPlata === 'Per sedinta'
  const sesiuneQ = useQuery({
    queryKey: ['open-sesiune', cursId, dataIncepere],
    queryFn: () => getOpenSesiuneByDate(cursId, dataIncepere),
    enabled: Boolean(cursId) && isFacultativPerSedinta && Boolean(dataIncepere),
  })
  const sesiunePlina =
    sesiuneQ.data != null && sesiuneQ.data.ocupate >= sesiuneQ.data.capacitate

  // Tip plata permis în funcție de tipul derivat din curs.
  // Default (fără curs ales) = setul recurent (cel mai comun).
  const tipPlataOptions = isFacultativ
    ? [
        { value: 'Per sedinta', label: 'Per ședință' },
        { value: 'Per luna',    label: 'Per lună' },
      ]
    : [
        { value: 'Per luna', label: 'Per lună' },
        { value: 'Per an',   label: 'Per an' },
      ]

  // Când schimb cursul, resetez voucherul. Dacă tipPlata curent nu mai e
  // valid pentru noul tip, îl readuc la 'Per luna' (valid pentru ambele seturi).
  const lastCursIdRef = useRef(cursId)
  useEffect(() => {
    if (lastCursIdRef.current === cursId) return
    lastCursIdRef.current = cursId
    setVoucherId('')
    const allowed: Enums<'tip_plata'>[] = isFacultativ
      ? ['Per sedinta', 'Per luna']
      : ['Per luna', 'Per an']
    if (!allowed.includes(tipPlata)) setTipPlata('Per luna')
  }, [cursId, isFacultativ, tipPlata])

  // Voucherul depinde și de tip_plata; resetează la schimbare.
  useEffect(() => {
    setVoucherId('')
  }, [tipPlata])

  // Opțiuni curs grupate vizual: Grupe → Trupe → Facultative, alfabetic în grup.
  const cursuriOpts: SelectOption[] = useMemo(() => {
    const decorated = cursuri.map((c) => {
      const tip = deriveTip(c)!
      return {
        curs: c,
        tip,
        opt: {
          value: c.id,
          label: c.numele,
          secondary: TIP_LABEL[tip],
        } satisfies SelectOption,
      }
    })
    decorated.sort((a, b) => {
      const t = TIP_ORDER[a.tip] - TIP_ORDER[b.tip]
      if (t !== 0) return t
      return a.curs.numele.localeCompare(b.curs.numele, 'ro')
    })
    return decorated.map((d) => d.opt)
  }, [cursuri])

  // Calculez sumă sugerată
  const sumaSugerata = useMemo(() => {
    if (!cursSelectat) return null
    if (isFacultativ) {
      return tipPlata === 'Per sedinta'
        ? cursSelectat.pret_sedinta
        : cursSelectat.pret_lunar
    }
    return tipPlata === 'Per an'
      ? cursSelectat.pret_anual
      : cursSelectat.pret_anual != null
        ? Math.round(cursSelectat.pret_anual / 10)
        : null
  }, [cursSelectat, isFacultativ, tipPlata])

  const vouchereQ = useQuery({
    queryKey: ['vouchere-disponibile', cursId, tipPlata],
    queryFn: () =>
      listAvailableVouchere({
        forCurs: cursId || null,
        forTipPlata: tipPlata,
        activeOnly: true,
      }),
    enabled: Boolean(cursId),
  })

  const voucherSelectat = useMemo(
    () => vouchereQ.data?.find((v) => v.id === voucherId) ?? null,
    [vouchereQ.data, voucherId],
  )

  // Preview al discountului automat de politică (cross-sell/family). Voucherul
  // manual și politica sunt mutual exclusive → nu-l interogăm dacă e voucher ales.
  const previewQ = useQuery({
    queryKey: ['preview-pool-discount', clientId, tipPlata, sumaSugerata],
    queryFn: () =>
      previewPoolDiscount({ client: clientId, tipPlata, sumaBaza: sumaSugerata! }),
    enabled: Boolean(clientId) && sumaSugerata != null && !voucherId,
    staleTime: 30_000,
  })
  const policyPreview = voucherId ? null : (previewQ.data ?? null)

  const submit = useMutation({
    mutationFn: () => {
      if (!tipInrolare) {
        throw new Error('Cursul selectat nu e încărcat. Reîncearcă.')
      }
      return createInrolari({
        client: clientId,
        cursId,
        tipInrolare,
        tipPlata,
        dataIncepere,
        sumaOverride: null,
        forceReinrolare: isAdmin ? forceReinrolare : false,
        voucherId: voucherId || null,
      })
    },
    onSuccess: (rows) => {
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      console.info(`[Înrolare] ${rows.length} rânduri create.`)
      // SMS de confirmare doar pentru recurent (grupă/trupă), cu fereastră de
      // undo de 5 min. Best-effort: o eroare aici nu blochează înrolarea.
      if (
        (tipInrolare === 'recurent-grupa' || tipInrolare === 'recurent-trupa') &&
        rows[0]
      ) {
        void scheduleConfirmareInrolare(rows[0].id).catch((e) =>
          console.error('[confirmare-inrolare]', e),
        )
      }
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!clientId) return setError('Selectează clientul.')
    if (!cursId) return setError('Selectează cursul.')
    if (dataIncepere < todayIso()) {
      return setError('Data nu poate fi în trecut.')
    }
    submit.mutate()
  }

  const previewRecurent = useMemo(
    () =>
      derivePreviewRecurent({
        dataIncepere,
        isFacultativ,
        isTrupa,
        tipPlata,
        cursSelectat,
        sezonStart: sezonActivQ.data?.data_incepere ?? null,
      }),
    [dataIncepere, isFacultativ, isTrupa, tipPlata, cursSelectat, sezonActivQ.data],
  )

  // Prorata (deci nevoie de preț) doar la înscriere TÂRZIE mid-lună — nu la
  // prima lună a sezonului (septembrie), care e rată întreagă.
  const seasonFirstMonth = sezonActivQ.data?.data_incepere
    ? sezonActivQ.data.data_incepere.slice(0, 7) + '-01'
    : null
  const primaLunaESezonStart =
    seasonFirstMonth != null && dataIncepere.slice(0, 7) + '-01' === seasonFirstMonth
  const blockantPretLipsa =
    !isFacultativ &&
    !isTrupa &&
    tipPlata === 'Per luna' &&
    !primaLunaESezonStart &&
    dataIncepere.slice(8, 10) !== '01' &&
    Boolean(cursSelectat) &&
    cursSelectat?.pret_sedinta == null &&
    cursSelectat?.pret_anual == null

  return (
    <Modal
      open={open}
      title="Înrolare nouă"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="enrollment-form"
            disabled={submit.isPending}
          >
            {submit.isPending ? 'Se creează…' : 'Creează înrolare'}
          </Button>
        </>
      }
    >
      {clientiQ.isLoading || cursuriQ.isLoading ? (
        <Spinner />
      ) : (
        <form
          id="enrollment-form"
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <Field label="Client" required htmlFor="client">
            <Combobox
              id="client"
              placeholder="— caută client după nume sau telefon —"
              options={clientiQ.data ?? []}
              value={clientId}
              onChange={setClientId}
              disabled={Boolean(defaultClientId)}
            />
          </Field>

          <EligibilityAlerts
            clientId={clientId}
            tipPlata={tipPlata}
            isFacultativ={isFacultativ}
          />

          <Field label="Curs" required htmlFor="curs">
            <Combobox
              id="curs"
              placeholder="— alege curs —"
              options={cursuriOpts}
              value={cursId}
              onChange={setCursId}
            />
            <p className="mt-1 text-xs text-quasar-gray">
              {locatieNume
                ? <>Cursuri active la <strong>{locatieNume}</strong>. </>
                : <>Cursuri active (toate locațiile). </>}
              {tipInrolare && (
                <>Tip înrolare: <strong>{TIP_LABEL[tipInrolare]}</strong>.</>
              )}
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tip plată" required htmlFor="tip_plata">
              <Select
                id="tip_plata"
                options={tipPlataOptions}
                value={tipPlata}
                onChange={(e) =>
                  setTipPlata(e.target.value as Enums<'tip_plata'>)
                }
              />
            </Field>
            <Field
              label={isFacultativ ? 'Data începerii' : 'Data semnării'}
              required
              htmlFor="data"
            >
              <DateInput
                id="data"
                value={dataIncepere}
                onChange={(e) => setDataIncepere(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Voucher (opțional)" htmlFor="voucher">
            <Select
              id="voucher"
              placeholder={
                cursId
                  ? vouchereQ.data && vouchereQ.data.length === 0
                    ? '— niciun voucher aplicabil —'
                    : '— fără voucher —'
                  : '— alege întâi cursul —'
              }
              options={(vouchereQ.data ?? []).map((v) => ({
                value: v.id,
                label:
                  v.tip === 'Procent'
                    ? `${v.cod_voucher} — ${v.valoare}%`
                    : v.tip === 'Valoare'
                      ? `${v.cod_voucher} — ${v.valoare} RON`
                      : v.cod_voucher,
              }))}
              value={voucherId}
              onChange={(e) => setVoucherId(e.target.value)}
              disabled={!cursId || (vouchereQ.data?.length ?? 0) === 0}
            />
            {voucherSelectat?.descriere && (
              <p className="mt-1 text-xs text-quasar-gray">
                {voucherSelectat.descriere}
              </p>
            )}
          </Field>

          {cursSelectat && (
            <PriceSummary
              sumaSugerata={sumaSugerata}
              voucherSelectat={voucherSelectat}
              tipPlata={tipPlata}
              isFacultativ={isFacultativ}
              policyPreview={policyPreview}
            />
          )}

          {!isFacultativ && tipPlata === 'Per luna' && (
            <RecurentPreview
              preview={previewRecurent}
              cursSelectat={cursSelectat}
              blockantPretLipsa={blockantPretLipsa}
            />
          )}

          {tipInrolare === 'recurent-grupa' && isAdmin && (
            <Checkbox
              id="force-reinrolare"
              label="Forțează re-înrolare (clientul a reziliat anterior în acest sezon — aprobare manager)"
              checked={forceReinrolare}
              onChange={(e) => setForceReinrolare(e.target.checked)}
            />
          )}

          {cursPlin && ocupareQ.data && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ Curs plin ({ocupareQ.data.activi}/{ocupareQ.data.capacitate}).
              Mai vrei să înscrii?
            </p>
          )}

          {isFacultativPerSedinta && cursId && dataIncepere && sesiuneQ.data && (
            <p
              className={[
                'rounded-md border px-3 py-2 text-sm',
                sesiunePlina
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-quasar-gray-light bg-quasar-gray-light/30 text-quasar-gray',
              ].join(' ')}
            >
              {sesiunePlina ? '⚠️ Sesiune completă' : 'Locuri sesiune'}:{' '}
              <strong className="text-quasar-black">
                {sesiuneQ.data.ocupate}/{sesiuneQ.data.capacitate}
              </strong>
              {sesiunePlina && ' — mai vrei să înscrii?'}
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
