import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
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
import { clientiOptions } from '@/lib/lookups'
import type { Curs, Enums } from '@/types/db'
import { listAvailableVouchere } from '@/features/vouchere/api'
import { getCursOcupare } from '@/features/cursuri/api/profile'
import { EligibilityAlerts } from '@/features/vouchere/EligibilityAlerts'
import {
  createInrolari,
  getCursForInrolare,
  listCursuriPentruInrolare,
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

  const cursuriQ = useQuery<Curs[]>({
    queryKey: ['cursuri-pentru-inrolare', locatieId],
    queryFn: () => listCursuriPentruInrolare(locatieId),
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
      }),
    [dataIncepere, isFacultativ, isTrupa, tipPlata, cursSelectat],
  )

  const blockantPretLipsa =
    !isFacultativ &&
    !isTrupa &&
    tipPlata === 'Per luna' &&
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
            <Select
              id="client"
              placeholder="— alege client —"
              options={clientiQ.data ?? []}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={Boolean(defaultClientId)}
            />
          </Field>

          <EligibilityAlerts clientId={clientId} />

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
              <TextInput
                id="data"
                type="date"
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

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
