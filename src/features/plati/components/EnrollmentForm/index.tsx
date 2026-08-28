import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  DateInput,
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
import { listSezoane } from '@/features/setari/api'
import { formatRON } from '@/lib/format'
import type { Curs, Enrollment, Enums } from '@/types/db'
import { listAvailableVouchere } from '@/features/vouchere/api'
import { applyVoucher } from '@/features/vouchere/calc'
import { getCursOcupare } from '@/features/cursuri/api/profile'
import { EligibilityAlerts } from '@/features/vouchere/EligibilityAlerts'
import { ClientDebtAlert } from '../ClientDebtAlert'
import {
  MetodaPlataField,
  resolveTenders,
  type MetodaSel,
} from '../../modals/PlataNouaModal/MetodaPlataField'
import {
  createInrolari,
  getCursForInrolare,
  getOpenSesiuneByDate,
  hasActiveEnrollmentOnCurs,
  listCursuriPentruInrolare,
  previewPoolDiscount,
  registerPlataFifo,
  rezervaBonusOpen,
  rezervaLocOpen,
  scheduleConfirmareInrolare,
} from '../../api'
import { PROMO_BONUS_IUNIE, PROMO_BONUS_IUNIE_PANA_LA } from '../../promo'
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
  // Sezonul pe care se deschide formularul (ex: selectorul din fișa clientului).
  // Ignorat dacă e un sezon deja încheiat — nu se poate înrola în trecut.
  defaultSezonId?: string
  // Apelat o singură dată când înrolarea s-a creat cu succes (independent de
  // încasare/bonus). Primește rândurile create (gol pentru fluxul OPEN per ședință).
  // Folosit de: conversia lead → marchează convertit; conversia ședință → abonament.
  onEnrolled?: (rows: Enrollment[]) => void
}

export function EnrollmentForm({
  open,
  onClose,
  defaultClientId,
  defaultCursId,
  defaultSezonId,
  onEnrolled,
}: Props) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const isAdmin = isAdminOrHigher(role)
  const { locatieId, locatieNume } = useWorkingLocatie()
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [cursId, setCursId] = useState(defaultCursId ?? '')
  const [sezonId, setSezonId] = useState('')
  const [tipPlata, setTipPlata] = useState<Enums<'tip_plata'>>('Per luna')
  const [dataIncepere, setDataIncepere] = useState(todayIso())
  const [voucherId, setVoucherId] = useState('')
  const [esteReinscriere, setEsteReinscriere] = useState(false)
  const [forceReinrolare, setForceReinrolare] = useState(false)
  const [includeBonusIunie, setIncludeBonusIunie] = useState(false)
  // Încasare la înrolare (toate tipurile): cât se plătește ACUM (0..preț).
  // Restul rămâne restanță. Pentru flux OPEN merge prin rezerva_loc_open,
  // pentru recurent/per lună prin registerPlataFifo după creare.
  const [incasat, setIncasat] = useState('')
  const [incasatTouched, setIncasatTouched] = useState(false)
  const [metoda, setMetoda] = useState<MetodaSel>('Cash')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [overbook, setOverbook] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientiQ = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
  })

  // Sezonul în care se face înrolarea. NU e neapărat cel activ: la începutul lui
  // septembrie recepția înscrie în sezonul care abia urmează (încă `planificat`).
  // Se oferă doar sezoanele neîncheiate — în trecut nu se poate înrola oricum
  // (garda „Data nu poate fi în trecut" din handleSubmit).
  const sezoaneQ = useQuery({ queryKey: ['sezoane-list'], queryFn: listSezoane })
  const sezoaneDisponibile = useMemo(() => {
    const today = todayIso()
    return (sezoaneQ.data ?? []).filter(
      (s) => s.data_incepere && s.data_final && s.data_final >= today,
    )
  }, [sezoaneQ.data])

  const sezonSelectat = useMemo(() => {
    const list = sezoaneDisponibile
    if (list.length === 0) return null
    const pick = (id: string | undefined) =>
      id ? (list.find((s) => s.id === id) ?? null) : null
    return (
      pick(sezonId) ??
      pick(defaultSezonId) ??
      list.find((s) => s.stare === 'activ') ??
      list[list.length - 1]
    )
  }, [sezonId, defaultSezonId, sezoaneDisponibile])

  const cursuriQ = useQuery<Curs[]>({
    queryKey: ['cursuri-pentru-inrolare', locatieId, sezonSelectat?.id ?? null],
    queryFn: () => listCursuriPentruInrolare(locatieId, sezonSelectat?.id ?? null),
    enabled: sezoaneQ.isSuccess,
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
    setIncasatTouched(false)
    const allowed: Enums<'tip_plata'>[] = isFacultativ
      ? ['Per sedinta', 'Per luna']
      : ['Per luna', 'Per an']
    if (!allowed.includes(tipPlata)) setTipPlata('Per luna')
  }, [cursId, isFacultativ, tipPlata])

  // Voucherul depinde și de tip_plata; resetează la schimbare.
  useEffect(() => {
    setVoucherId('')
    setIncasatTouched(false)
  }, [tipPlata])

  // Schimbarea sezonului invalidează cursul ales (listele nu se intersectează) și
  // mută data în interiorul noului sezon — altfel `createInrolari` ar deduce
  // sezonul din dată și ar genera ratele în sezonul greșit.
  const handleSezonChange = (id: string) => {
    setSezonId(id)
    setCursId('')
    setEsteReinscriere(false)
  }

  // Data trebuie să cadă în sezonul curent al formularului — inclusiv când
  // sezonul vine din afară (`defaultSezonId`) și nu s-a apăsat pe selector.
  // Altfel formularul arată „Sezon 2026-2027" cu data de azi (august), iar
  // înrolarea ar ateriza în sezonul de vară.
  const lastSezonRef = useRef<string | null>(null)
  useEffect(() => {
    const s = sezonSelectat
    if (!s?.data_incepere || !s.data_final) return
    if (lastSezonRef.current === s.id) return
    lastSezonRef.current = s.id
    setDataIncepere((prev) =>
      prev >= s.data_incepere! && prev <= s.data_final! ? prev : s.data_incepere!,
    )
  }, [sezonSelectat])

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

  // Prețul promo de reînscriere e o a doua valoare pe curs (`pret_lunar_promo`),
  // nu un override manual. Doar la GRUPE: trupele nu au preț promo (decizie
  // 2026-08-28) — se reînscriu la rata normală.
  const promoDisponibil =
    !isFacultativ &&
    !isTrupa &&
    tipPlata === 'Per luna' &&
    cursSelectat?.pret_lunar_promo != null
  const aplicPromo = promoDisponibil && esteReinscriere

  useEffect(() => {
    if (!promoDisponibil) setEsteReinscriere(false)
  }, [promoDisponibil])

  // Calculez sumă sugerată
  const sumaSugerata = useMemo(() => {
    if (!cursSelectat) return null
    if (isFacultativ) {
      return tipPlata === 'Per sedinta'
        ? cursSelectat.pret_sedinta
        : cursSelectat.pret_lunar
    }
    if (tipPlata === 'Per an') return cursSelectat.pret_anual
    if (aplicPromo) return cursSelectat.pret_lunar_promo
    return cursSelectat.pret_anual != null
      ? Math.round(cursSelectat.pret_anual / 10)
      : null
  }, [cursSelectat, isFacultativ, tipPlata, aplicPromo])

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
    queryKey: ['preview-pool-discount', clientId, cursId, tipPlata, sumaSugerata],
    queryFn: () =>
      previewPoolDiscount({
        client: clientId,
        cursId: cursId || null,
        tipPlata,
        sumaBaza: sumaSugerata!,
      }),
    enabled: Boolean(clientId) && sumaSugerata != null && !voucherId,
    staleTime: 30_000,
  })
  const policyPreview =
    voucherId || isFacultativPerSedinta ? null : (previewQ.data ?? null)

  // Gard anti-dublură (oglindește createInrolari): dacă are deja o înrolare
  // activă ne-Per-ședință pe acest curs care acoperă data începerii sau mai
  // departe, avertizează și blochează submit-ul. Per ședință = sesiuni multiple ok.
  const dejaInrolatQ = useQuery({
    queryKey: ['deja-inrolat-curs', clientId, cursId, dataIncepere],
    queryFn: () =>
      hasActiveEnrollmentOnCurs({
        client: clientId,
        cursId,
        fromDate: dataIncepere,
      }),
    enabled:
      Boolean(clientId) &&
      Boolean(cursId) &&
      !isFacultativPerSedinta &&
      Boolean(dataIncepere),
    staleTime: 30_000,
  })
  const dejaInrolat = !isFacultativPerSedinta && dejaInrolatQ.data === true

  // Prețul final afișat (după voucher / politică). Pentru recurent „Per lună"
  // = rata lunară; pentru OPEN/facultativ = prețul ședinței/lunii.
  const finalPret = useMemo(() => {
    if (sumaSugerata == null) return null
    if (voucherSelectat) return applyVoucher(sumaSugerata, voucherSelectat).sumaFinala
    if (policyPreview) return policyPreview.suma_finala
    return sumaSugerata
  }, [sumaSugerata, voucherSelectat, policyPreview])

  const incasatNum = Number(incasat) || 0
  const restInrolare = finalPret != null ? Math.max(0, finalPret - incasatNum) : 0

  // Default „Încasează acum" = prețul final, până când recepția îl editează.
  useEffect(() => {
    if (incasatTouched) return
    setIncasat(finalPret != null ? String(finalPret) : '')
  }, [finalPret, incasatTouched])

  const submit = useMutation({
    mutationFn: (): Promise<Enrollment[] | string> => {
      if (!tipInrolare) {
        throw new Error('Cursul selectat nu e încărcat. Reîncearcă.')
      }
      // Facultativ „Per ședință" = rezervare la o sesiune OPEN + încasare (parțial/0),
      // atomic (același flux ca tab-ul Open class). Nu creăm un enrollment „sec".
      if (isFacultativPerSedinta) {
        if (!locatieId) {
          throw new Error(
            'Setează locația de lucru din bara de sus (📍 lângă dată).',
          )
        }
        const pretSed = sumaSugerata ?? 0
        if (!(pretSed > 0)) {
          throw new Error('Cursul nu are preț pe ședință configurat.')
        }
        if (incasatNum > pretSed + 0.001) {
          throw new Error('Suma încasată depășește prețul.')
        }
        // Încasare 0 → fără tenders (nicio metodă cerută); restul rămâne restanță.
        const tenders =
          incasatNum > 0 ? resolveTenders({ metoda, total: incasatNum, cash, card }) : []
        const [t0, t1] = tenders
        return rezervaLocOpen({
          clientId,
          suma: t0?.suma ?? 0,
          metoda: t0?.metoda ?? 'Cash',
          metoda2: t1?.metoda ?? null,
          suma2: t1?.suma ?? null,
          pret: pretSed,
          locatieId,
          sesiuneId: sesiuneQ.data?.sesiune?.id ?? null,
          cursId,
          data: dataIncepere,
          instructorId: null,
          permiteOverbook: overbook,
        })
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
        esteReinscriere: aplicPromo,
      })
    },
    onSuccess: async (result) => {
      // Înrolarea există deja (createInrolari/rezerva_loc_open au reușit). Semnalăm
      // imediat — chiar dacă o încasare/bonus de mai jos eșuează, omul e înrolat.
      onEnrolled?.(Array.isArray(result) ? result : [])
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      // Flux OPEN: rezervarea + încasarea sunt deja create în RPC. Reîmprospătăm
      // ocuparea sesiunilor și rosterul grupei (cardul recepției).
      if (isFacultativPerSedinta) {
        void queryClient.invalidateQueries({ queryKey: ['open-sesiune'] })
        void queryClient.invalidateQueries({ queryKey: ['open-sesiuni'] })
        void queryClient.invalidateQueries({ queryKey: ['open-rezervari'] })
        void queryClient.invalidateQueries({ queryKey: ['grupa-dashboard'] })
        onClose()
        return
      }
      const rows = result as Enrollment[]
      console.info(`[Înrolare] ${rows.length} rânduri create.`)
      // Încasare la înrolare (parțial/0): distribuie FIFO peste rândurile create
      // (vechi → nou). Înrolarea există deja; dacă încasarea eșuează păstrăm modalul
      // deschis cu eroarea (se poate încasa ulterior din „Plată nouă → Abonament").
      if (incasatNum > 0 && rows.length > 0 && locatieId) {
        const ordered = [...rows].sort((a, b) =>
          (a.data_incepere ?? '').localeCompare(b.data_incepere ?? ''),
        )
        const remaining = ordered.map((r) => Number(r.suma ?? 0))
        const pool = Math.min(
          incasatNum,
          remaining.reduce((a, b) => a + b, 0),
        )
        if (pool > 0) {
          try {
            const tenders = resolveTenders({ metoda, total: pool, cash, card })
            await registerPlataFifo({
              clientId,
              enrollmentIds: ordered.map((r) => r.id),
              remaining,
              partialAmount: pool,
              metoda: tenders[0].metoda,
              tenders,
              data: todayIso(),
              locatieId,
            })
          } catch (e) {
            setError(
              'Înrolarea s-a creat, dar încasarea a eșuat: ' +
                (humanizeError(e, 'eroare necunoscută')) +
                '. Încaseaz-o din „Plată nouă → Abonament".',
            )
            return
          }
        }
      }
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
      // Promo iulie: rezervări bonus 29-30 iunie pe înrolarea facultativă Per lună.
      // Înrolarea e deja creată; dacă bonusul eșuează, păstrăm modalul deschis cu
      // eroarea ca recepția să știe (idempotent → re-submit nu dublează).
      if (includeBonusIunie && showBonusIunie && rows[0]) {
        try {
          await rezervaBonusOpen(rows[0].id, PROMO_BONUS_IUNIE)
        } catch (e) {
          setError(
            'Înrolarea s-a creat, dar rezervările bonus 29-30 iunie au eșuat: ' +
              (humanizeError(e, 'eroare necunoscută')) +
              '. Reîncearcă.',
          )
          return
        }
      }
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!clientId) return setError('Selectează clientul.')
    if (!cursId) return setError('Selectează cursul.')
    if (dataIncepere < todayIso()) {
      return setError('Data nu poate fi în trecut.')
    }
    // O semnare ÎNAINTEA sezonului e legitimă (reînscriere în august pentru
    // toamnă) — ratele pornesc oricum de la startul sezonului. După finalul
    // sezonului însă nu mai are ce genera.
    if (sezonSelectat?.data_final && dataIncepere > sezonSelectat.data_final) {
      return setError(
        `Data depășește finalul sezonului „${sezonSelectat.numele_sezonului}" (${sezonSelectat.data_final}).`,
      )
    }
    if (dejaInrolat) {
      return setError(
        'Clientul e deja înrolat la acest curs în această perioadă.',
      )
    }
    submit.mutate()
  }

  const previewRecurent = useMemo(
    () =>
      derivePreviewRecurent({
        // Oglindește `startEfectiv` din buildRecurentPerLuna: semnarea dinaintea
        // sezonului nu adaugă o rată pentru luna semnării.
        dataIncepere:
          sezonSelectat?.data_incepere &&
          dataIncepere < sezonSelectat.data_incepere
            ? sezonSelectat.data_incepere
            : dataIncepere,
        isFacultativ,
        isTrupa,
        tipPlata,
        cursSelectat,
        sezonStart: sezonSelectat?.data_incepere ?? null,
        sezonEnd: sezonSelectat?.data_final ?? null,
      }),
    [dataIncepere, isFacultativ, isTrupa, tipPlata, cursSelectat, sezonSelectat],
  )

  // Prorata (deci nevoie de preț) doar la înscriere TÂRZIE mid-lună — nu la
  // prima lună a sezonului (septembrie), care e rată întreagă.
  const seasonFirstMonth = sezonSelectat?.data_incepere
    ? sezonSelectat.data_incepere.slice(0, 7) + '-01'
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

  // Promo iulie: abonament facultativ „Per lună" cu start în iulie 2026, creat în
  // fereastra promoției (≤ 30 iunie) → poate include gratuit ședințele 29-30 iunie.
  // Guard pe luna iulie: la un abonament de iunie zilele sunt deja acoperite.
  const showBonusIunie =
    isFacultativ &&
    tipPlata === 'Per luna' &&
    todayIso() <= PROMO_BONUS_IUNIE_PANA_LA &&
    dataIncepere.slice(0, 7) === '2026-07'

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
            disabled={
              submit.isPending ||
              dejaInrolat ||
              (isFacultativPerSedinta && sesiunePlina && !overbook)
            }
          >
            {submit.isPending
              ? 'Se creează…'
              : isFacultativPerSedinta
                ? sesiunePlina && !overbook
                  ? 'Sesiune completă'
                  : 'Rezervă + încasează'
                : 'Creează înrolare'}
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

          <ClientDebtAlert clientId={clientId} />

          {sezoaneDisponibile.length > 1 && (
            <Field label="Sezon" required htmlFor="sezon">
              <Select
                id="sezon"
                options={sezoaneDisponibile.map((s) => ({
                  value: s.id,
                  label:
                    s.stare === 'activ'
                      ? `${s.numele_sezonului} (curent)`
                      : s.numele_sezonului,
                }))}
                value={sezonSelectat?.id ?? ''}
                onChange={(e) => handleSezonChange(e.target.value)}
              />
              {sezonSelectat?.stare === 'planificat' && (
                <p className="mt-1 text-xs text-quasar-gray">
                  Sezon viitor — înrolarea începe la{' '}
                  <strong>{sezonSelectat.data_incepere}</strong>.
                </p>
              )}
            </Field>
          )}

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

          {dejaInrolat && (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              ⚠️ Clientul e deja înrolat la acest curs în această perioadă.
              Verifică înrolările existente în profil înainte de a crea alta.
            </p>
          )}

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

          {promoDisponibil && (
            <div className="rounded-md border border-purple-200 bg-purple-50 px-3 py-2">
              <Checkbox
                label={`Preț de reînscriere — ${formatRON(cursSelectat!.pret_lunar_promo!)}/lună în loc de ${formatRON(Math.round((cursSelectat!.pret_anual ?? 0) / 10))}`}
                checked={esteReinscriere}
                onChange={(e) => {
                  setEsteReinscriere(e.target.checked)
                  setIncasatTouched(false)
                }}
              />
              <p className="mt-1 text-xs text-purple-800">
                Se aplică pe toate ratele sezonului. Promoția se anulează automat
                dacă o rată rămâne neachitată după data de 15.
              </p>
            </div>
          )}

          {/* Voucherul nu se aplică pe fluxul OPEN (rezervare per ședință). */}
          {!isFacultativPerSedinta && (
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
                        ? `${v.cod_voucher} — ${formatRON(v.valoare)}`
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
          )}

          {cursSelectat && (
            <PriceSummary
              sumaSugerata={sumaSugerata}
              voucherSelectat={voucherSelectat}
              tipPlata={tipPlata}
              isFacultativ={isFacultativ}
              policyPreview={policyPreview}
            />
          )}

          {cursSelectat && sumaSugerata != null && !blockantPretLipsa && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Încasează acum (RON)">
                <TextInput
                  type="number"
                  min={0}
                  max={finalPret ?? undefined}
                  step="0.01"
                  value={incasat}
                  onChange={(e) => {
                    setIncasat(e.target.value)
                    setIncasatTouched(true)
                  }}
                />
                <p className="mt-1 text-xs text-quasar-gray">
                  {!isFacultativ && tipPlata === 'Per luna' ? 'Rată curentă: ' : 'Preț: '}
                  <strong className="text-quasar-black">
                    {formatRON(finalPret ?? 0)}
                  </strong>
                  {restInrolare > 0 && (
                    <>
                      {' '}· rest{' '}
                      <strong className="text-quasar-black">
                        {formatRON(restInrolare)}
                      </strong>{' '}
                      (restanță)
                    </>
                  )}
                </p>
              </Field>
              {incasatNum > 0 && (
                <MetodaPlataField
                  metoda={metoda}
                  onMetoda={setMetoda}
                  total={incasatNum}
                  cash={cash}
                  card={card}
                  onCash={setCash}
                  onCard={setCard}
                />
              )}
            </div>
          )}

          {!isFacultativ && tipPlata === 'Per luna' && (
            <RecurentPreview
              preview={previewRecurent}
              cursSelectat={cursSelectat}
              blockantPretLipsa={blockantPretLipsa}
            />
          )}

          {showBonusIunie && (
            <Checkbox
              id="bonus-iunie"
              label="Include ședințele bonus 29-30 iunie (promo iulie) — acces gratuit, fără plată suplimentară"
              checked={includeBonusIunie}
              onChange={(e) => setIncludeBonusIunie(e.target.checked)}
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

          {isFacultativPerSedinta && sesiunePlina && (
            <Checkbox
              id="overbook"
              label="Adaugă peste limită (walk-in la sală)"
              checked={overbook}
              onChange={(e) => setOverbook(e.target.checked)}
            />
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
