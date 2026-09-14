import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Modal,
  Select,
  Spinner,
  TextInput,
} from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { locatiiOptions, sezoaneOptions, sezonActivId } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import {
  listContracteActivePeTemplate,
  listTargetsContracte,
  listTemplates,
  sendContracte,
  type ContractTarget,
  type SendTarget,
} from './api'
import { CONTRACT_STATUS_LABEL, CONTRACT_TIP_LABEL } from './constants'

const BATCH_SIZE = 20

// „familie" = un contract pe familie, cu toți copiii (contractul educațional);
// „copil" = câte un contract per copil bifat (actul adițional).
type Mod = 'familie' | 'copil'

type Row = ContractTarget & {
  canal: 'sms' | 'email' | null
  existent: string | null
  eligibil: boolean
}

type Rezultat = {
  ok: number
  sms: number
  email: number
  netrimise: number
  errors: string[]
}

type Props = { open: boolean; onClose: () => void }

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function TrimiteBulkClientiModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const working = useWorkingLocatie()

  const [templateId, setTemplateId] = useState('')
  const [mod, setMod] = useState<Mod>('familie')
  const [sezon, setSezon] = useState('')
  const [locatie, setLocatie] = useState(working.locatieId ?? '')
  const [cursId, setCursId] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<Rezultat | null>(null)

  const { data: templates } = useQuery({
    queryKey: ['contract-templates'],
    queryFn: listTemplates,
    enabled: open,
  })
  const sezoane = useQuery({ queryKey: ['lookup', 'sezoane'], queryFn: sezoaneOptions, enabled: open })
  const locatii = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions, enabled: open })
  const sezonActiv = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
    enabled: open,
  })

  // Presetăm sezonul activ o singură dată — contractele se trimit pentru sezonul
  // în curs; operatorul poate trece pe „Toate".
  const [sezonInit, setSezonInit] = useState(false)
  useEffect(() => {
    if (!sezonInit && sezonActiv.isSuccess) {
      setSezon(sezonActiv.data ?? '')
      setSezonInit(true)
    }
  }, [sezonInit, sezonActiv.isSuccess, sezonActiv.data])

  const cursuri = useCursuriOptions({
    enabled: open && sezonInit,
    locatieId: locatie || null,
    sezonId: sezon || null,
  })

  const targetsQ = useQuery({
    queryKey: ['contract-targets', { sezon, locatie, cursId }],
    queryFn: () => listTargetsContracte({ sezonId: sezon, locatieId: locatie, cursId }),
    enabled: open && sezonInit,
  })
  const activeQ = useQuery({
    queryKey: ['contracte-active-template', templateId],
    queryFn: () => listContracteActivePeTemplate(templateId),
    enabled: open && !!templateId,
  })

  const rows = useMemo<Row[]>(() => {
    const peFamilie = new Map<string, string>()
    const peCopil = new Map<string, string>()
    for (const c of activeQ.data ?? []) {
      if (c.client_id) peCopil.set(c.client_id, c.status)
      if (!peFamilie.has(c.familie_id)) peFamilie.set(c.familie_id, c.status)
    }
    return (targetsQ.data ?? []).map((t) => {
      const canal = t.telefon ? 'sms' : t.email ? 'email' : null
      // Aceeași regulă ca gardul din contract-send: pe familie blochează orice
      // contract viu al familiei; pe copil doar contractul acelui copil.
      const existent =
        mod === 'familie'
          ? t.familie_id
            ? (peFamilie.get(t.familie_id) ?? null)
            : null
          : (peCopil.get(t.client_id) ?? null)
      return {
        ...t,
        canal,
        existent,
        eligibil: !!t.familie_id && !!canal && !existent && !!templateId,
      }
    })
  }, [targetsQ.data, activeQ.data, mod, templateId])

  const vizibile = useMemo(() => {
    const q = norm(search.trim())
    if (!q) return rows
    return rows.filter(
      (r) => norm(r.client_nume).includes(q) || norm(r.familie_nume).includes(q),
    )
  }, [rows, search])

  const selectate = useMemo(
    () => rows.filter((r) => r.eligibil && selected.has(r.client_id)),
    [rows, selected],
  )

  // Un contract per familie deduplică copiii aceleiași familii; per copil, unu la unu.
  const deTrimis = useMemo(() => {
    const out: Array<SendTarget & { canal: 'sms' | 'email' }> = []
    const familiiVazute = new Set<string>()
    for (const r of selectate) {
      const familieId = r.familie_id!
      const canal = r.canal!
      if (mod === 'copil') {
        out.push({ familieId, clientId: r.client_id, canal })
        continue
      }
      if (familiiVazute.has(familieId)) continue
      familiiVazute.add(familieId)
      out.push({ familieId, clientId: null, canal })
    }
    return out
  }, [selectate, mod])

  const faraFamilie = vizibile.filter((r) => !r.familie_id)
  const faraContact = vizibile.filter((r) => r.familie_id && !r.canal)
  const cuContract = vizibile.filter((r) => r.existent).length
  const eligibileVizibile = vizibile.filter((r) => r.eligibil)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selectAllVizibile = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of eligibileVizibile) next.add(r.client_id)
      return next
    })
  const clearSelection = () => setSelected(new Set())

  // Selecția e legată de lista curentă: la schimbarea filtrelor de server o
  // golim, ca să nu plece contracte către cineva care nu se mai vede în listă.
  const onFilterChange = (apply: () => void) => {
    apply()
    setSelected(new Set())
    setResult(null)
  }

  const send = useMutation({
    mutationFn: async (): Promise<Rezultat> => {
      let ok = 0
      let sms = 0
      let email = 0
      let netrimise = 0
      const errors: string[] = []
      for (let i = 0; i < deTrimis.length; i += BATCH_SIZE) {
        const batch = deTrimis.slice(i, i + BATCH_SIZE)
        setProgress(`Se trimite… ${Math.min(i + BATCH_SIZE, deTrimis.length)}/${deTrimis.length}`)
        const results = await sendContracte({
          templateId,
          targets: batch.map(({ familieId, clientId }) => ({ familieId, clientId })),
        })
        for (const r of results) {
          if (!r.ok) {
            if (r.error) errors.push(r.error)
            continue
          }
          ok++
          if (!r.notificat && !r.amanat) {
            netrimise++
            if (r.notificareEroare) errors.push(r.notificareEroare)
          } else if (r.canal === 'email') email++
          else sms++
        }
      }
      return { ok, sms, email, netrimise, errors: errors.slice(0, 5) }
    },
    onSuccess: (r) => {
      setProgress(null)
      setResult(r)
      setSelected(new Set())
      queryClient.invalidateQueries({ queryKey: ['contracte'] })
      queryClient.invalidateQueries({ queryKey: ['contracte-active-template', templateId] })
    },
    onError: (e) => {
      setProgress(null)
      setResult({ ok: 0, sms: 0, email: 0, netrimise: 0, errors: [humanizeError(e)] })
    },
  })

  function close() {
    setResult(null)
    setProgress(null)
    setSelected(new Set())
    setSearch('')
    send.reset()
    onClose()
  }

  const nrSms = deTrimis.filter((t) => t.canal === 'sms').length
  const nrEmail = deTrimis.length - nrSms

  return (
    <Modal
      open={open}
      onClose={close}
      title="Trimite contracte în bulk"
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Închide
          </Button>
          <Button
            onClick={() => send.mutate()}
            disabled={!templateId || deTrimis.length === 0 || send.isPending}
          >
            {send.isPending
              ? 'Se trimite…'
              : `Trimite ${deTrimis.length} ${deTrimis.length === 1 ? 'contract' : 'contracte'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Șablon" htmlFor="bulk-tpl" required>
            <Select
              id="bulk-tpl"
              value={templateId}
              onChange={(e) => onFilterChange(() => setTemplateId(e.target.value))}
              placeholder="Alege șablonul…"
              options={(templates ?? []).map((t) => ({
                value: t.id,
                label: `${t.nume} (${CONTRACT_TIP_LABEL[t.tip] ?? t.tip})`,
              }))}
            />
          </Field>
          <Field label="Cum se trimite" htmlFor="bulk-mod">
            <Select
              id="bulk-mod"
              value={mod}
              onChange={(e) => onFilterChange(() => setMod(e.target.value as Mod))}
              options={[
                { value: 'familie', label: 'Un contract per familie (toți copiii)' },
                { value: 'copil', label: 'Un contract per copil bifat' },
              ]}
            />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Sezon" htmlFor="bulk-sezon">
            <Select
              id="bulk-sezon"
              placeholder="Toate"
              options={sezoane.data ?? []}
              value={sezon}
              onChange={(e) =>
                onFilterChange(() => {
                  setSezon(e.target.value)
                  setCursId('')
                })
              }
            />
          </Field>
          <Field label="Locație" htmlFor="bulk-loc">
            <Select
              id="bulk-loc"
              placeholder="Toate"
              options={locatii.data ?? []}
              value={locatie}
              onChange={(e) =>
                onFilterChange(() => {
                  setLocatie(e.target.value)
                  setCursId('')
                })
              }
            />
          </Field>
          <Field label="Grupă" htmlFor="bulk-curs">
            <Select
              id="bulk-curs"
              placeholder="Toate grupele"
              options={cursuri.data ?? []}
              value={cursId}
              onChange={(e) => onFilterChange(() => setCursId(e.target.value))}
            />
          </Field>
          <Field label="Caută" htmlFor="bulk-search">
            <TextInput
              id="bulk-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nume copil sau familie…"
            />
          </Field>
        </div>

        {!templateId && (
          <p className="text-sm text-muted-2">Alege șablonul ca să poți bifa clienți.</p>
        )}

        {targetsQ.isLoading || !sezonInit ? (
          <Spinner />
        ) : targetsQ.isError ? (
          <p className="text-sm text-red-600">{humanizeError(targetsQ.error)}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-quasar-yellow/10 px-3 py-2 text-sm">
              <span className="font-medium">
                {vizibile.length} clienți · {selectate.length} bifați →{' '}
                {deTrimis.length} {deTrimis.length === 1 ? 'contract' : 'contracte'}
                {deTrimis.length > 0 && ` (${nrSms} SMS, ${nrEmail} email)`}
              </span>
              {cuContract > 0 && (
                <span className="text-muted-2">{cuContract} au deja contract pe șablon</span>
              )}
              <span className="ml-auto flex gap-2">
                <Button
                  variant="ghost"
                  onClick={selectAllVizibile}
                  disabled={eligibileVizibile.length === 0}
                >
                  Bifează toți eligibilii ({eligibileVizibile.length})
                </Button>
                <Button variant="ghost" onClick={clearSelection} disabled={selected.size === 0}>
                  Debifează
                </Button>
              </span>
            </div>

            <div className="max-h-96 overflow-y-auto rounded-md border border-line">
              {vizibile.length === 0 ? (
                <p className="p-3 text-sm text-muted-2">
                  Niciun client cu înrolare în curs pentru acest filtru.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {vizibile.map((r) => {
                    const existent = r.existent
                      ? (CONTRACT_STATUS_LABEL[r.existent] ?? {
                          label: r.existent,
                          tone: 'neutral' as const,
                        })
                      : null
                    return (
                      <li
                        key={r.client_id}
                        className="flex items-start justify-between gap-3 px-3 py-2"
                      >
                        <Checkbox
                          id={`bulk-${r.client_id}`}
                          checked={selected.has(r.client_id) && r.eligibil}
                          disabled={!r.eligibil}
                          onChange={() => toggle(r.client_id)}
                          label={
                            <span>
                              <span className="font-medium">{r.client_nume}</span>
                              {r.familie_nume && (
                                <span className="ml-2 text-muted-2">fam. {r.familie_nume}</span>
                              )}
                              <span className="block text-xs text-muted-2">
                                {r.cursuri.join(', ')}
                                {r.locatie_nume ? ` · ${r.locatie_nume}` : ''}
                              </span>
                            </span>
                          }
                        />
                        <span className="flex shrink-0 items-center gap-1">
                          {existent && <Badge tone={existent.tone}>{existent.label}</Badge>}
                          {!r.familie_id ? (
                            <Badge tone="danger">fără familie</Badge>
                          ) : r.canal === 'sms' ? (
                            <Badge tone="neutral">SMS</Badge>
                          ) : r.canal === 'email' ? (
                            <Badge tone="neutral">Email</Badge>
                          ) : (
                            <Badge tone="danger">fără contact</Badge>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {(faraFamilie.length > 0 || faraContact.length > 0) && (
              <p className="text-sm text-amber-700">
                ⚠️ Nu pot primi link:{' '}
                {faraFamilie.length > 0 && `${faraFamilie.length} fără familie în fișă`}
                {faraFamilie.length > 0 && faraContact.length > 0 && ', '}
                {faraContact.length > 0 && `${faraContact.length} cu familie fără telefon și email`}
                . Completează fișa familiei și revino.
              </p>
            )}
          </>
        )}

        {progress && <p className="text-sm text-muted-2">{progress}</p>}
        {result && (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-green-700">
              ✓ {result.ok} contracte create — {result.sms} pe SMS, {result.email} pe email
            </p>
            {result.netrimise > 0 && (
              <p className="text-red-600">
                ⚠️ {result.netrimise} create dar NEnotificate — trimite linkul manual
              </p>
            )}
            {result.errors.map((e, i) => (
              <p key={i} className="text-red-600">
                {e}
              </p>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
