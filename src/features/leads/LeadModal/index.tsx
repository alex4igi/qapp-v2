import { humanizeError } from '@/lib/errorMessage'
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type FormEvent,
  type CSSProperties,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { ConversieModal, type ConversieResult } from '../ConversieModal'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'
import {
  campaniiOptions,
  locatiiOptions,
  matchLocatieId,
  sezonActiv,
} from '@/lib/lookups'
import type { Lead, GrupaLead } from '@/types/db'
import {
  STATUS_CONFIG,
  GRUPA_TO_VARSTA_CURS,
  ZILE_SAPTAMANA,
  waLeadMessage,
} from '../constants'
import {
  createLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  checkDuplicateTelefon,
  reactivateFromNurture,
  listCursuriProgramabile,
  listEvenimenteProgramabile,
  createProgramareLead,
  getLatestProgramare,
  enqueueConfirmareProgramare,
  markLeadConvertit,
  getLeadConversionInfo,
  type LeadForm,
} from '../api'
import { waLink } from '@/lib/phone'
import { LeadHistory } from '../LeadHistory'
import { LogContactModal } from '../LogContactModal'
import { OptOutSection } from '@/features/opt-out/OptOutSection'
import { STATUS_TONE } from './styles'
import { EMPTY, fromLead } from './helpers'
import { IdentityRail } from './IdentityRail'
import { PipelineStepper } from './PipelineStepper'
import { ConvertitSection } from './sections/ConvertitSection'
import { ProgramareSection } from './sections/ProgramareSection'
import { ContactatSection } from './sections/ContactatSection'
import { PierdutSection } from './sections/PierdutSection'
import { DateContactSection, type DupHit } from './sections/DateContactSection'
import { ProfilInteresSection } from './sections/ProfilInteresSection'

type Props = {
  open: boolean
  lead?: Lead | null
  defaultStatus?: string
  /** Deschis prin drag pe „Programat": pre-setează statusul ca să apară secțiunea
   *  de programare (dată + curs/eveniment). */
  startScheduling?: boolean
  onClose: () => void
}

export function LeadModal({
  open,
  lead,
  defaultStatus,
  startScheduling,
  onClose,
}: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { role } = useAuth()
  const isEdit = Boolean(lead)
  const [form, setForm] = useState<LeadForm>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [dupHit, setDupHit] = useState<DupHit | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<'detalii' | 'istoric'>('detalii')
  const [showLogContact, setShowLogContact] = useState(false)
  // Flux de conversie (Finalizare înscriere → înrolare), pornit din pasul „Convertit".
  const [convertFlow, setConvertFlow] = useState(false)
  const [enrollData, setEnrollData] = useState<ConversieResult | null>(null)
  // Selecția cursului/evenimentului pentru programare: `curs:<id>` / `ev:<id>`.
  const [selectie, setSelectie] = useState('')
  const [ignoreVarsta, setIgnoreVarsta] = useState(false)
  // Valorile programării la deschidere — ca să nu re-creăm o programare la edituri
  // care nu schimbă data/cursul.
  const [initial, setInitial] = useState<{ data: string; selectie: string }>({
    data: '',
    selectie: '',
  })

  const campanii = useQuery({
    queryKey: ['lookup', 'campanii'],
    queryFn: campaniiOptions,
  })
  // Cheie proprie: `['lookup','sezon-activ']` e folosită în alte module cu
  // `sezonActivId` (string), iar aceeași cheie cu două forme de date se
  // suprascriu reciproc în cache.
  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ-detalii'],
    queryFn: sezonActiv,
    enabled: open,
  })
  const cursuriQ = useQuery({
    queryKey: ['cursuri', 'programabile', sezonActivQ.data?.id ?? null],
    queryFn: () => listCursuriProgramabile(sezonActivQ.data?.id ?? null),
    enabled: open && sezonActivQ.isSuccess,
  })
  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
    enabled: open,
  })
  // Lead convertit → aducem clientul + grupa/cursul real din înrolarea activă.
  const conversionQ = useQuery({
    queryKey: ['lead-conversion', lead?.id_client],
    queryFn: () => getLeadConversionInfo(lead!.id_client!),
    enabled:
      open && form.status === 'convertit' && Boolean(lead?.id_client),
  })

  useEffect(() => {
    if (!open) return
    const base = lead
      ? fromLead(lead)
      : { ...EMPTY, status: (defaultStatus as LeadForm['status']) ?? 'nou' }
    setForm(
      startScheduling ? { ...base, status: 'programat' } : base,
    )
    setError(null)
    setDupHit(null)
    setConfirmDelete(false)
    setTab('detalii')
    setSelectie('')
    setIgnoreVarsta(false)
    setInitial({ data: lead?.data_programare?.slice(0, 10) ?? '', selectie: '' })
  }, [open, lead, defaultStatus, startScheduling])

  // ESC închide modalul (shell propriu, nu mai folosim componenta Modal).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Prefill selecția cursului/evenimentului la editarea unui lead deja programat.
  useEffect(() => {
    if (!open || !lead) return
    let cancelled = false
    void getLatestProgramare(lead.id).then((p) => {
      if (cancelled || !p) return
      const sel = p.cursId
        ? `curs:${p.cursId}`
        : p.evenimentId
          ? `ev:${p.evenimentId}`
          : ''
      setSelectie(sel)
      setInitial((cur) => ({ ...cur, selectie: sel }))
    })
    return () => {
      cancelled = true
    }
  }, [open, lead])

  const evenimenteQ = useQuery({
    queryKey: ['evenimente', 'programabile', form.data_programare],
    queryFn: () => listEvenimenteProgramabile(form.data_programare),
    enabled: open && Boolean(form.data_programare),
  })

  // Locația preferată (text scurt din form, ex. „Ștefan cel Mare") → uuid
  // (programari_leads.locatie e FK). Numele din tabela `locatii` diferă ca
  // formă („Galeriile Stefan cel Mare", fără diacritice), așa că potrivim
  // normalizat (fără diacritice) + pe substring, nu pe egalitate strictă.
  // Rezolvă o locație dată ca text („Nicolina") SAU ca uuid → uuid din `locatii`.
  const resolveLocatieId = useCallback(
    (raw: string | null) => matchLocatieId(raw, locatiiQ.data),
    [locatiiQ.data],
  )

  const leadLocatieId = useMemo(
    () => resolveLocatieId(form.locatia),
    [form.locatia, resolveLocatieId],
  )

  const weekday = form.data_programare
    ? ZILE_SAPTAMANA[new Date(form.data_programare).getDay()]
    : null

  // O dată în afara sezonului activ (pauza dintre sezoane) nu are curs recurent
  // valid: în intervalul ăla se ține doar „DEMO Class", deci scoatem cursurile din
  // dropdown ca să nu poată fi alese din greșeală. Fără sezon activ = același caz.
  const intreSezoane = Boolean(
    form.data_programare &&
      (!sezonActivQ.data ||
        form.data_programare < sezonActivQ.data.data_incepere ||
        form.data_programare > sezonActivQ.data.data_final),
  )

  // Cursurile din ziua aleasă (filtrate pe grupă + zi + locație) + evenimentele zilei.
  const optiuni = useMemo(() => {
    const all = cursuriQ.data ?? []
    // Locația e filtru DUR: dacă e aleasă, nu arătăm niciodată cursuri din alte
    // locații (cursurile fără locație rămân, fiind valabile oriunde).
    const byLocatie = leadLocatieId
      ? all.filter((c) => !c.locatie || c.locatie === leadLocatieId)
      : all
    const varstaCurs =
      form.grupa_varsta && !ignoreVarsta
        ? GRUPA_TO_VARSTA_CURS[form.grupa_varsta as GrupaLead]
        : null
    // Grupa + ziua sunt filtre SOFT: dacă golesc lista, revenim la toate
    // cursurile din locația aleasă (nu din toate locațiile).
    const filtered = byLocatie.filter((c) => {
      if (varstaCurs && c.varsta && c.varsta !== varstaCurs && c.varsta !== 'Mixt')
        return false
      if (weekday && c.zile?.length && !c.zile.includes(weekday)) return false
      return true
    })
    const cursList = intreSezoane ? [] : filtered.length ? filtered : byLocatie
    // Aceeași regulă pentru evenimente: dacă locația e aleasă, doar evenimentele
    // din ea (plus cele fără locație setată).
    // `evenimente.locatia` e text liber („Nicolina"), nu FK ca la cursuri — deci
    // trece prin același rezolvator, altfel niciun eveniment cu locație scrisă nu
    // ar potrivi uuid-ul leadului și dropdown-ul ar rămâne gol.
    const evList = (evenimenteQ.data ?? []).filter((e) => {
      if (!leadLocatieId) return true
      const evLoc = resolveLocatieId(e.locatia)
      return !evLoc || evLoc === leadLocatieId
    })
    return [
      ...cursList.map((c) => ({ label: c.numele, value: `curs:${c.id}` })),
      ...evList.map((e) => ({
        label: `${e.ora ? `${e.ora.slice(0, 5)} · ` : ''}${e.nume_eveniment} (eveniment)`,
        value: `ev:${e.id}`,
      })),
    ]
  }, [
    cursuriQ.data,
    form.grupa_varsta,
    weekday,
    leadLocatieId,
    evenimenteQ.data,
    ignoreVarsta,
    resolveLocatieId,
    intreSezoane,
  ])

  // Rezolvă curs/eveniment + oră din selecția curentă.
  const resolveSelectie = () => {
    if (!selectie) return null
    if (selectie.startsWith('curs:')) {
      const id = selectie.slice(5)
      const curs = cursuriQ.data?.find((c) => c.id === id)
      const ora = (weekday && curs?.ore_pe_zi?.[weekday]) || curs?.ora || null
      return {
        cursId: id,
        evenimentId: null as string | null,
        ora,
        locatie: curs?.locatie ?? leadLocatieId,
      }
    }
    const id = selectie.slice(3)
    const ev = evenimenteQ.data?.find((e) => e.id === id)
    return {
      cursId: null as string | null,
      evenimentId: id,
      // Locația programării o dă evenimentul, nu preferința leadului: SMS-ul de
      // confirmare/reminder trimite adresa de aici, iar 2 din 3 leaduri n-au
      // locația completată (fallback-ul ar da adresa greșită la demo la Nicolina).
      ora: ev?.ora ?? null,
      locatie: resolveLocatieId(ev?.locatia ?? null) ?? leadLocatieId,
    }
  }

  const set = <K extends keyof LeadForm>(key: K, value: LeadForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const patch = (p: Partial<LeadForm>) =>
    setForm((prev) => ({ ...prev, ...p }))

  const checkDup = useCallback(
    async (telefon: string) => {
      if (!telefon.trim()) return
      const res = await checkDuplicateTelefon(telefon, lead?.id)
      if (res.duplicate && res.lead) {
        const name = [res.lead.prenume, res.lead.nume]
          .filter(Boolean)
          .join(' ')
        setDupHit({
          id: res.lead.id,
          name,
          isNurture: res.lead.status === 'nurture',
        })
      }
    },
    [lead?.id],
  )

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['leads'] })

  // Din dedup: leadul cu acest telefon e în Nurture → reactivare directă în „Nou"
  // (în loc să creăm un duplicat sau să căutăm manual în tab-ul Nurture).
  const reactivate = useMutation({
    mutationFn: (id: string) => reactivateFromNurture(id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
  })

  // Programarea se aplică doar dacă data + curs/eveniment sunt setate ȘI ceva
  // s-a schimbat (dată sau selecție) sau leadul nu era deja programat.
  const scheduleChanged =
    form.status === 'programat' &&
    Boolean(form.data_programare) &&
    Boolean(selectie) &&
    (form.data_programare !== initial.data ||
      selectie !== initial.selectie ||
      lead?.status !== 'programat')

  const save = useMutation({
    mutationFn: async () => {
      // Date-driven: dacă programăm (dată + curs), leadul devine 'programat'.
      const formToSave: LeadForm = scheduleChanged
        ? { ...form, status: 'programat' }
        : form
      let leadId = lead?.id ?? null
      if (isEdit) {
        await updateLead(lead!.id, formToSave)
      } else {
        const created = await createLead(formToSave)
        leadId = created.id
      }
      if (scheduleChanged && leadId) {
        const sel = resolveSelectie()!
        await createProgramareLead({
          lead: leadId,
          cursul_programat: sel.cursId,
          eveniment_programat: sel.evenimentId,
          locatie: sel.locatie,
          data_programarii: form.data_programare.slice(0, 10),
          ora: sel.ora,
        })
        // Confirmarea SMS pleacă după 5 min (fereastră de undo).
        await enqueueConfirmareProgramare(leadId)
      }
    },
    onSuccess: () => {
      void invalidate()
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => deleteLead(lead!.id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la ștergere.')),
  })

  // Mutare rapidă în Nurture (pool de reactivare). Folosește updateLeadStatus —
  // calea ușoară, fără a cere formularul complet valid (ex: lead fără sursă).
  const moveToNurture = useMutation({
    mutationFn: () => updateLeadStatus(lead!.id, 'nurture'),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la mutare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume.trim()) {
      setError('Numele este obligatoriu.')
      return
    }
    if (!form.telefon.trim()) {
      setError('Telefonul este obligatoriu.')
      return
    }
    if (!form.sursa) {
      setError('Sursa (campania) este obligatorie.')
      return
    }
    // Programare: dacă statusul e „Programat", data + curs/eveniment sunt
    // obligatorii (altfel leadul n-ar ajunge în rosterul unei grupe).
    if (form.status === 'programat') {
      if (!form.data_programare) {
        setError('Setează data programării.')
        return
      }
      if (!selectie) {
        setError('Alege cursul sau evenimentul pentru programare.')
        return
      }
    }
    // Contactat cu sub-status (de_revenit / nu_raspunde) → data de follow-up e
    // obligatorie (paritate cu ContactareModal).
    if (form.status === 'contactat' && form.sub_status && !form.data_callback_dorit) {
      setError('Setează data de follow-up.')
      return
    }
    save.mutate()
  }

  if (!open) return null

  const tone = STATUS_TONE[form.status] ?? STATUS_TONE.nou
  const statusLabel = STATUS_CONFIG[form.status]?.label ?? form.status
  const campaignLabel =
    campanii.data?.find((c) => c.value === form.sursa)?.label ?? ''
  const waHref = form.telefon ? waLink(form.telefon, waLeadMessage(form)) : null
  const tabBtn = (active: boolean): CSSProperties => ({
    height: '30px',
    padding: '0 14px',
    border: 'none',
    borderRadius: '7px',
    fontSize: '12.5px',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? 'var(--color-rail)' : 'transparent',
    color: active ? '#fff' : '#8A857C',
  })

  return (
    <>
      <div
        onMouseDown={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: 'rgba(8,6,2,.5)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '40px 24px',
          overflowY: 'auto',
        }}
      >
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            width: '1000px',
            maxWidth: '100%',
            background: '#fff',
            borderRadius: '18px',
            boxShadow: '0 30px 80px rgba(8,6,2,.5)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100vh - 80px)',
          }}
        >
          {/* header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '17px 22px',
              borderBottom: '1px solid var(--color-line)',
            }}
          >
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '9px',
                background: 'var(--color-quasar-yellow)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1814" strokeWidth="2.2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '17px', lineHeight: 1.1 }}>
                {isEdit ? 'Editare lead' : 'Lead nou'}
              </div>
              {isEdit && campaignLabel && (
                <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                  Sursă {campaignLabel}
                </div>
              )}
            </div>
            {isEdit && lead && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'var(--color-surface)', borderRadius: '9px', padding: '3px' }}>
                <button type="button" onClick={() => setTab('detalii')} style={tabBtn(tab === 'detalii')}>Detalii</button>
                <button type="button" onClick={() => setTab('istoric')} style={tabBtn(tab === 'istoric')}>Istoric</button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Închide"
              style={{ width: '32px', height: '32px', border: 'none', background: 'var(--color-surface)', borderRadius: '8px', fontSize: '15px', color: 'var(--color-muted-2)', cursor: 'pointer', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>

          {/* body: două panouri */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <IdentityRail
              form={form}
              lead={lead}
              isEdit={isEdit}
              tone={tone}
              statusLabel={statusLabel}
              waHref={waHref}
              onLogContact={() => setShowLogContact(true)}
              onMoveToNurture={() => moveToNurture.mutate()}
              movePending={moveToNurture.isPending}
            />

            {/* panou formular (dreapta) */}
            <div className="qbody" style={{ flex: 1, minWidth: 0, padding: '22px 24px', overflowY: 'auto' }}>
              {isEdit && lead && tab === 'istoric' ? (
                <LeadHistory leadId={lead.id} />
              ) : (
                <form id="lead-form" onSubmit={handleSubmit}>
                  <PipelineStepper
                    status={form.status}
                    canStartConvert={isEdit && Boolean(lead)}
                    onPickStatus={(s) => set('status', s)}
                    onStartConvert={() => setConvertFlow(true)}
                  />

                  {form.status === 'convertit' && (
                    <ConvertitSection
                      hasClient={Boolean(lead?.id_client)}
                      loading={conversionQ.isLoading}
                      info={conversionQ.data}
                      onOpenClient={(clientId) => {
                        onClose()
                        navigate(`/clienti/${clientId}`)
                      }}
                    />
                  )}

                  {form.status === 'programat' && (
                    <ProgramareSection
                      dataProgramare={form.data_programare}
                      onDataChange={(v) => set('data_programare', v)}
                      selectie={selectie}
                      onSelectieChange={setSelectie}
                      optiuni={optiuni}
                      cursuri={cursuriQ.data ?? []}
                      cursuriLoading={cursuriQ.isLoading}
                      grupaVarsta={form.grupa_varsta}
                      ignoreVarsta={ignoreVarsta}
                      onIgnoreVarstaChange={setIgnoreVarsta}
                      intreSezoane={intreSezoane}
                    />
                  )}

                  {form.status === 'contactat' && (
                    <ContactatSection
                      subStatus={form.sub_status}
                      dataCallback={form.data_callback_dorit}
                      onPatch={patch}
                    />
                  )}

                  {form.status === 'pierdut' && (
                    <PierdutSection
                      motiv={form.motiv_pierdut}
                      onChange={(v) => set('motiv_pierdut', v)}
                    />
                  )}

                  <DateContactSection
                    form={form}
                    set={set}
                    dupHit={dupHit}
                    onTelefonChange={(v) => {
                      set('telefon', v)
                      setDupHit(null)
                    }}
                    onTelefonBlur={(v) => void checkDup(v)}
                    onReactivate={(id) => reactivate.mutate(id)}
                    reactivatePending={reactivate.isPending}
                  />

                  <ProfilInteresSection
                    form={form}
                    set={set}
                    campanii={campanii.data ?? []}
                  />

                  {/* OBSERVAȚII */}
                  <div style={{ marginTop: '18px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted-2)', marginBottom: '6px' }}>Observații</div>
                    <textarea className="qf" rows={2} value={form.observatii} onChange={(e) => set('observatii', e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #E4E0D7', borderRadius: '9px', fontSize: '13.5px', color: 'var(--color-ink)', background: '#fff', outline: 'none', resize: 'vertical', minHeight: '62px', fontFamily: 'var(--font-sans)' }} />
                  </div>

                  {isEdit && lead && (
                    <div style={{ marginTop: '16px' }}>
                      <OptOutSection
                        entity="lead"
                        id={lead.id}
                        optOut={lead.opt_out_marketing ?? false}
                        motiv={lead.opt_out_motiv ?? null}
                        la={lead.opt_out_la ?? null}
                        invalidateKey={['leads']}
                      />
                    </div>
                  )}

                  {error && <div style={{ fontSize: '13px', color: '#C2403F', marginTop: '12px' }}>{error}</div>}
                </form>
              )}
            </div>
          </div>

          {/* footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 22px', borderTop: '1px solid var(--color-line)', background: '#FBFAF6' }}>
            {isEdit && isManagerOrHigher(role) && (
              confirmDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-muted-2)' }}>Confirmi ștergerea?</span>
                  <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()} style={{ height: '40px', padding: '0 14px', border: 'none', background: '#C2403F', borderRadius: '9px', fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Șterge</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} style={{ height: '40px', padding: '0 14px', border: '1px solid #E4E0D7', background: '#fff', borderRadius: '9px', fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', cursor: 'pointer' }}>Nu</button>
                </div>
              ) : (
                <button type="button" className="qact" onClick={() => setConfirmDelete(true)} style={{ height: '40px', padding: '0 14px', border: '1px solid #F0C9C9', background: '#fff', borderRadius: '9px', fontSize: '13px', fontWeight: 600, color: '#C2403F', cursor: 'pointer' }}>Șterge lead</button>
              )
            )}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={{ height: '40px', padding: '0 16px', border: '1px solid #E4E0D7', background: '#fff', borderRadius: '9px', fontSize: '13.5px', fontWeight: 600, color: 'var(--color-ink)', cursor: 'pointer' }}>Anulează</button>
            {tab === 'detalii' && (
              <button type="submit" form="lead-form" disabled={save.isPending} className="qbtnp" style={{ height: '40px', padding: '0 20px', border: 'none', background: 'var(--color-quasar-yellow)', borderRadius: '9px', fontSize: '13.5px', fontWeight: 700, color: 'var(--color-ink)', cursor: 'pointer' }}>
                {save.isPending ? 'Se salvează…' : isEdit ? 'Salvează' : 'Adaugă lead'}
              </button>
            )}
          </div>
        </div>
      </div>
      {isEdit && lead && (
        <LogContactModal open={showLogContact} lead={lead} onClose={() => setShowLogContact(false)} />
      )}
      {/* Conversie atomică: Finalizare înscriere → înrolare → abia apoi convertit. */}
      {convertFlow && lead && (
        <ConversieModal
          open
          lead={lead}
          onClose={() => setConvertFlow(false)}
          onConverted={(result) => {
            setConvertFlow(false)
            setEnrollData(result)
          }}
        />
      )}
      {enrollData && (
        <EnrollmentForm
          open
          defaultClientId={enrollData.clientId}
          defaultCursId={enrollData.cursId ?? undefined}
          sugestieVarsta={
            form.grupa_varsta
              ? GRUPA_TO_VARSTA_CURS[form.grupa_varsta as GrupaLead]
              : null
          }
          sugestieLocatie={form.locatia || null}
          onEnrolled={() => {
            // Înrolarea a reușit → abia acum lead-ul devine convertit.
            void markLeadConvertit(enrollData.leadId).finally(() => {
              void invalidate()
              void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
              setEnrollData(null)
              onClose()
            })
          }}
          onClose={() => setEnrollData(null)}
        />
      )}
    </>
  )
}
