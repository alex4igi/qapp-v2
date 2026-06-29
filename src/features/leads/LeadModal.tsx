import { humanizeError } from '@/lib/errorMessage'
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type FormEvent,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { ConversieModal, type ConversieResult } from './ConversieModal'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'
import { campaniiOptions, locatiiOptions, sezonActivId } from '@/lib/lookups'
import type { Lead, GrupaLead } from '@/types/db'
import {
  STATUS_CONFIG,
  SUB_STATUS_OPTIONS,
  INTERESE,
  GRUPE,
  GRUPA_LABELS,
  GRUPA_TO_VARSTA_CURS,
  LOCATII,
  ZILE_SAPTAMANA,
  dataPesteZile,
} from './constants'
import {
  createLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  checkDuplicateTelefon,
  listCursuriProgramabile,
  listEvenimenteProgramabile,
  createProgramareLead,
  getLatestProgramare,
  enqueueConfirmareProgramare,
  markLeadConvertit,
  getLeadConversionInfo,
  type LeadForm,
} from './api'
import { waLink } from '@/lib/phone'
import { waLeadMessage } from './constants'
import { LeadHistory } from './LeadHistory'
import { LogContactModal } from './LogContactModal'
import { OptOutSection } from '@/features/opt-out/OptOutSection'

type Props = {
  open: boolean
  lead?: Lead | null
  defaultStatus?: string
  /** Deschis prin drag pe „Programat": pre-setează statusul ca să apară secțiunea
   *  de programare (dată + curs/eveniment). */
  startScheduling?: boolean
  onClose: () => void
}

// ── Stiluri & helperi pentru designul „Quasar OS — Lead Modal" ──────────────
const inputStyle: CSSProperties = {
  width: '100%',
  height: '40px',
  padding: '0 12px',
  border: '1px solid #E4E0D7',
  borderRadius: '9px',
  fontSize: '13.5px',
  color: 'var(--color-ink)',
  background: '#fff',
  outline: 'none',
}
const selectStyle: CSSProperties = { ...inputStyle, padding: '0 10px' }
const sectionLabel: CSSProperties = {
  fontSize: '11px',
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  fontWeight: 700,
}
const fieldLabel: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--color-muted-2)',
  marginBottom: '6px',
}
const actBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '40px',
  borderRadius: '10px',
  border: '1px solid #E4E0D7',
  background: '#fff',
  color: 'var(--color-ink)',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

// Tonuri (text + fundal + bordură) per status — pentru badge & pastile.
const STATUS_TONE: Record<string, { fg: string; bg: string; bd: string }> = {
  nou: { fg: '#6B6760', bg: '#F2EFE9', bd: '#E4E0D7' },
  contactat: { fg: '#1F6FB2', bg: '#EAF2FB', bd: '#BBD8F0' },
  waiting_list: { fg: '#7A5E00', bg: '#FFF6E5', bd: '#F0D98A' },
  programat: { fg: '#9A7B00', bg: '#FFF6C2', bd: '#F0D98A' },
  a_venit: { fg: '#1E8A5B', bg: '#E7F4EE', bd: '#BFE3CE' },
  nu_a_venit: { fg: '#C2403F', bg: '#FDF1F1', bd: '#F0C9C9' },
  convertit: { fg: '#1E7A4D', bg: '#EAF6EF', bd: '#BFE3CE' },
  pierdut: { fg: '#C2403F', bg: '#FDF1F1', bd: '#F0C9C9' },
  nurture: { fg: '#1E7A4D', bg: '#EAF6EF', bd: '#BFE3CE' },
}

const STEP_ORDER = ['nou', 'contactat', 'programat', 'convertit'] as const
const EXIT_KEYS = ['waiting_list', 'a_venit', 'nu_a_venit', 'nurture', 'pierdut'] as const

function ageFromDob(dob: string): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a >= 0 && a < 120 ? a : null
}

function initialsOf(prenume: string, nume: string): string {
  const a = (prenume || '').trim()[0] ?? ''
  const b = (nume || '').trim()[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

function L({ children, req }: { children: ReactNode; req?: boolean }) {
  return (
    <div style={fieldLabel}>
      {children}
      {req && <span style={{ color: '#D64545' }}> *</span>}
    </div>
  )
}

const EMPTY: LeadForm = {
  prenume: '',
  nume: '',
  nume_parinte: '',
  telefon: '',
  email: '',
  data_nasterii: '',
  sursa: '',
  interes: '',
  grupa_varsta: '',
  status: 'nou',
  sub_status: '',
  motiv_pierdut: '',
  locatia: '',
  data_programare: '',
  data_callback_dorit: '',
  observatii: '',
}

function fromLead(lead: Lead): LeadForm {
  return {
    prenume: lead.prenume ?? '',
    nume: lead.nume,
    nume_parinte: lead.nume_parinte ?? '',
    telefon: lead.telefon ?? '',
    email: lead.email ?? '',
    data_nasterii: lead.data_nasterii ?? '',
    sursa: lead.sursa ?? '',
    interes: lead.interes ?? '',
    grupa_varsta: lead.grupa_varsta ?? '',
    status: lead.status,
    sub_status: lead.sub_status ?? '',
    motiv_pierdut: lead.motiv_pierdut ?? '',
    locatia: lead.locatia ?? '',
    data_programare: lead.data_programare
      ? lead.data_programare.slice(0, 10)
      : '',
    data_callback_dorit: lead.data_callback_dorit
      ? lead.data_callback_dorit.slice(0, 10)
      : '',
    observatii: lead.observatii ?? '',
  }
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
  const [dupWarning, setDupWarning] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<'detalii' | 'istoric'>('detalii')
  const [showLogContact, setShowLogContact] = useState(false)
  // Flux de conversie (Finalizare înscriere → înrolare), pornit din pasul „Convertit".
  const [convertFlow, setConvertFlow] = useState(false)
  const [enrollData, setEnrollData] = useState<ConversieResult | null>(null)
  // Selecția cursului/evenimentului pentru programare: `curs:<id>` / `ev:<id>`.
  const [selectie, setSelectie] = useState('')
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
  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
    enabled: open,
  })
  const cursuriQ = useQuery({
    queryKey: ['cursuri', 'programabile', sezonActivQ.data ?? null],
    queryFn: () => listCursuriProgramabile(sezonActivQ.data ?? null),
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
    setDupWarning(null)
    setConfirmDelete(false)
    setTab('detalii')
    setSelectie('')
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
  const leadLocatieId = useMemo(() => {
    if (!form.locatia) return null
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
    const target = norm(form.locatia)
    const match = locatiiQ.data?.find((l) => {
      const n = norm(l.label)
      return n === target || n.includes(target) || target.includes(n)
    })
    return match?.value ?? null
  }, [form.locatia, locatiiQ.data])

  const weekday = form.data_programare
    ? ZILE_SAPTAMANA[new Date(form.data_programare).getDay()]
    : null

  // Cursurile din ziua aleasă (filtrate pe grupă + zi + locație) + evenimentele zilei.
  const optiuni = useMemo(() => {
    const all = cursuriQ.data ?? []
    // Locația e filtru DUR: dacă e aleasă, nu arătăm niciodată cursuri din alte
    // locații (cursurile fără locație rămân, fiind valabile oriunde).
    const byLocatie = leadLocatieId
      ? all.filter((c) => !c.locatie || c.locatie === leadLocatieId)
      : all
    const varstaCurs = form.grupa_varsta
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
    const cursList = filtered.length ? filtered : byLocatie
    // Aceeași regulă pentru evenimente: dacă locația e aleasă, doar evenimentele
    // din ea (plus cele fără locație setată).
    const evList = (evenimenteQ.data ?? []).filter((e) =>
      leadLocatieId ? !e.locatia || e.locatia === leadLocatieId : true,
    )
    return [
      ...cursList.map((c) => ({ label: c.numele, value: `curs:${c.id}` })),
      ...evList.map((e) => ({
        label: `${e.nume_eveniment} (eveniment)`,
        value: `ev:${e.id}`,
      })),
    ]
  }, [cursuriQ.data, form.grupa_varsta, weekday, leadLocatieId, evenimenteQ.data])

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
      ora: ev?.ora ?? null,
      locatie: leadLocatieId,
    }
  }

  const set = <K extends keyof LeadForm>(key: K, value: LeadForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const checkDup = useCallback(
    async (telefon: string) => {
      if (!telefon.trim()) return
      const res = await checkDuplicateTelefon(telefon, lead?.id)
      if (res.duplicate && res.lead) {
        const name = [res.lead.prenume, res.lead.nume]
          .filter(Boolean)
          .join(' ')
        setDupWarning(`Telefon existent: ${name}`)
      }
    },
    [lead?.id],
  )

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['leads'] })

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
        // Confirmarea SMS pleacă după 2 min (fereastră de undo).
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

  const fullName = [form.prenume, form.nume].filter(Boolean).join(' ').trim()
  const age = ageFromDob(form.data_nasterii)
  const grupaLabel = form.grupa_varsta
    ? GRUPA_LABELS[form.grupa_varsta as GrupaLead]
    : ''
  const tone = STATUS_TONE[form.status] ?? STATUS_TONE.nou
  const statusLabel = STATUS_CONFIG[form.status]?.label ?? form.status
  const campaignLabel =
    campanii.data?.find((c) => c.value === form.sursa)?.label ?? ''
  const waHref = form.telefon ? waLink(form.telefon, waLeadMessage(form)) : null
  const activeIdx = (STEP_ORDER as readonly string[]).indexOf(form.status)
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
            {/* rail identitate (stânga) */}
            <div className="qbody" style={{ width: '288px', flexShrink: 0, background: '#FBFAF6', borderRight: '1px solid var(--color-line)', padding: '22px 20px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-rail)', color: 'var(--color-quasar-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '22px' }}>
                  {initialsOf(form.prenume, form.nume)}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '17px', marginTop: '11px' }}>
                  {fullName || 'Lead nou'}
                </div>
                {(age != null || grupaLabel) && (
                  <div style={{ fontSize: '12.5px', color: 'var(--color-muted)', marginTop: '2px' }}>
                    {[age != null ? `${age} ani` : null, grupaLabel].filter(Boolean).join(' · ')}
                  </div>
                )}
                <span style={{ marginTop: '9px', fontSize: '11.5px', fontWeight: 700, color: tone.fg, background: tone.bg, padding: '4px 12px', borderRadius: '20px' }}>
                  ● {statusLabel}
                </span>
              </div>

              {/* contact rapid */}
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '1px', background: '#fff', border: '1px solid #EFEBE2', borderRadius: '11px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 13px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A958B" strokeWidth="2"><path d="M4 5a2 2 0 0 1 2-2h2.3a1 1 0 0 1 1 .76l.9 3.6a1 1 0 0 1-.5 1.1L8 9.8a13 13 0 0 0 6.2 6.2l1.3-1.6a1 1 0 0 1 1.1-.5l3.6.9a1 1 0 0 1 .8 1V18a2 2 0 0 1-2 2A16 16 0 0 1 4 5Z" /></svg>
                  <span className="fnum" style={{ fontSize: '13px', color: 'var(--color-ink)', fontWeight: 500 }}>{form.telefon || '—'}</span>
                </div>
                <div style={{ height: '1px', background: '#F4F1EA' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 13px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A958B" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                  <span style={{ fontSize: '13px', color: 'var(--color-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{form.email || '—'}</span>
                </div>
                <div style={{ height: '1px', background: '#F4F1EA' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 13px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A958B" strokeWidth="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.6" /></svg>
                  <span style={{ fontSize: '13px', color: 'var(--color-ink)' }}>{form.locatia || '—'}</span>
                </div>
              </div>

              {/* contor contactări */}
              {isEdit && lead && lead.nr_contactari > 0 && (
                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px', background: '#FFF6E5', border: '1px solid #F6E2A8', borderRadius: '11px', padding: '11px 13px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--color-quasar-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--color-ink)' }}>
                    {lead.nr_contactari}
                  </div>
                  <div style={{ fontSize: '12px', color: '#7A5E00', lineHeight: 1.35 }}>
                    Contactări fără răspuns{lead.flag_reminder ? ' · marcat revenire' : ''}
                  </div>
                </div>
              )}

              {/* acțiuni rapide */}
              {isEdit && lead && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {waHref && (
                    <a href={waHref} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '42px', borderRadius: '10px', background: '#1FA855', color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.2-.2-1.2-1.5-1.2-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.2.1.4.1.6-.1l.7-.9c.2-.2.4-.2.6-.1l1.9.9c.2.1.4.2.4.3.1.2.1.6-.1 1.2Z" /></svg>
                      WhatsApp
                    </a>
                  )}
                  <button type="button" className="qact" onClick={() => setShowLogContact(true)} style={actBtn}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B6760" strokeWidth="2"><path d="M4 5a2 2 0 0 1 2-2h2.3a1 1 0 0 1 1 .76l.9 3.6a1 1 0 0 1-.5 1.1L8 9.8a13 13 0 0 0 6.2 6.2l1.3-1.6a1 1 0 0 1 1.1-.5l3.6.9a1 1 0 0 1 .8 1V18a2 2 0 0 1-2 2A16 16 0 0 1 4 5Z" /></svg>
                    Loghează contact
                  </button>
                  {lead.status !== 'nurture' && (
                    <button type="button" className="qact" disabled={moveToNurture.isPending} onClick={() => moveToNurture.mutate()} style={actBtn}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1E8A5B" strokeWidth="2"><path d="M12 22s-7-5.6-7-12a7 7 0 0 1 14 0c0 6.4-7 12-7 12Z" opacity=".25" /><path d="M12 7c-2 2.5-2 5 0 7 2-2 2-4.5 0-7Z" /></svg>
                      {moveToNurture.isPending ? 'Se mută…' : 'Mută în Nurture'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* panou formular (dreapta) */}
            <div className="qbody" style={{ flex: 1, minWidth: 0, padding: '22px 24px', overflowY: 'auto' }}>
              {isEdit && lead && tab === 'istoric' ? (
                <LeadHistory leadId={lead.id} />
              ) : (
                <form id="lead-form" onSubmit={handleSubmit}>
                  {/* stepper pipeline */}
                  <div style={sectionLabel}>Status în pipeline</div>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: '7px', marginTop: '11px' }}>
                    {STEP_ORDER.map((key, i) => {
                      const done = activeIdx > i
                      const isActive = activeIdx === i
                      return (
                        <button
                          key={key}
                          type="button"
                          className="qstep"
                          onClick={() => {
                            // „Convertit" e atomic: nu se forțează statusul, ci se
                            // pornește fluxul real (client + înrolare). Doar pe lead
                            // existent și dacă nu e deja convertit.
                            if (
                              key === 'convertit' &&
                              form.status !== 'convertit' &&
                              isEdit &&
                              lead
                            ) {
                              setConvertFlow(true)
                            } else {
                              set('status', key)
                            }
                          }}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', padding: '11px 4px 10px', border: '1px solid ' + (isActive ? '#F0D98A' : '#EFEBE2'), background: isActive ? '#FFFBEF' : '#fff', borderRadius: '11px', cursor: 'pointer' }}
                        >
                          <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: done ? '#1E8A5B' : isActive ? '#FFD600' : '#fff', border: '2px solid ' + (done ? '#1E8A5B' : isActive ? '#FFD600' : '#DAD5CA'), color: done ? '#fff' : isActive ? '#1A1814' : '#B5B0A6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px' }}>
                            {done ? '✓' : i + 1}
                          </span>
                          <span className="qstep-label" style={{ fontSize: '12px', fontWeight: 600, color: isActive ? '#1A1814' : done ? '#1E8A5B' : '#9A958B' }}>
                            {STATUS_CONFIG[key].label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                    {EXIT_KEYS.map((key) => {
                      const on = form.status === key
                      const t = STATUS_TONE[key]
                      return (
                        <button
                          key={key}
                          type="button"
                          className="qexit"
                          onClick={() => set('status', key)}
                          style={{ height: '32px', padding: '0 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: on ? '#fff' : t.fg, background: on ? t.fg : t.bg, border: '1px solid ' + (on ? t.fg : t.bd) }}
                        >
                          {STATUS_CONFIG[key].label}
                        </button>
                      )
                    })}
                  </div>

                  {/* condițional: CONVERTIT — datele reale ale clientului + grupa
                      din înrolare (sursa de adevăr), nu câmpurile de lead. */}
                  {form.status === 'convertit' && (
                    <div style={{ marginTop: '18px', border: '1px solid #BFE3CE', background: '#EAF6EF', borderRadius: '13px', padding: '15px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E7A4D" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13.5px', color: '#176B43' }}>Înscriere finalizată</span>
                      </div>
                      {!lead?.id_client ? (
                        <div style={{ fontSize: '12.5px', color: '#3F6488' }}>
                          Lead marcat convertit, dar fără client legat. Reia înscrierea pentru a corecta.
                        </div>
                      ) : conversionQ.isLoading ? (
                        <div style={{ fontSize: '12.5px', color: 'var(--color-muted)' }}>Se încarcă datele clientului…</div>
                      ) : conversionQ.data ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px' }}>
                            <div>
                              <div style={fieldLabel}>Client</div>
                              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-ink)' }}>{conversionQ.data.clientNume || '—'}</div>
                            </div>
                            <div>
                              <div style={fieldLabel}>Grupă / curs</div>
                              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-ink)' }}>
                                {conversionQ.data.cursNume
                                  ? `${conversionQ.data.cursNume}${conversionQ.data.cursVarsta ? ` · ${conversionQ.data.cursVarsta}` : ''}`
                                  : 'Fără înrolare activă'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="qact"
                            onClick={() => { onClose(); navigate(`/clienti/${conversionQ.data!.clientId}`) }}
                            style={{ ...actBtn, marginTop: '13px', width: '100%' }}
                          >
                            Deschide fișa clientului →
                          </button>
                        </>
                      ) : (
                        <div style={{ fontSize: '12.5px', color: 'var(--color-muted)' }}>
                          Clientul legat nu a putut fi încărcat.
                        </div>
                      )}
                    </div>
                  )}

                  {/* condițional: PROGRAMARE */}
                  {form.status === 'programat' && (
                    <div style={{ marginTop: '18px', border: '1px solid #BBD8F0', background: '#F0F7FE', borderRadius: '13px', padding: '15px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '13px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F6FB2" strokeWidth="2"><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13.5px', color: '#185389' }}>Programare la o grupă</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px' }}>
                        <div>
                          <L req>Data programării</L>
                          <input className="qf" type="date" value={form.data_programare} onChange={(e) => set('data_programare', e.target.value)} style={{ ...inputStyle, border: '1px solid #BBD8F0' }} />
                        </div>
                        <div>
                          <L req>Curs / eveniment</L>
                          <select className="qf" value={selectie} onChange={(e) => setSelectie(e.target.value)} style={{ ...selectStyle, border: '1px solid #BBD8F0' }}>
                            <option value="">{cursuriQ.isLoading ? 'Se încarcă…' : '— selectează —'}</option>
                            {optiuni.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '9px', marginTop: '12px', fontSize: '11.5px', color: '#3F6488', lineHeight: 1.45 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3F6488" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                        <span>La salvare leadul apare în rosterul grupei din acea zi. Confirmarea SMS pleacă după 2 minute (fereastră de corecții). Data nașterii nu e obligatorie.</span>
                      </div>
                    </div>
                  )}

                  {/* condițional: FOLLOW-UP */}
                  {form.status === 'contactat' && (
                    <div style={{ marginTop: '18px', border: '1px solid #F6E2A8', background: '#FFFBEF', borderRadius: '13px', padding: '15px 16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px' }}>
                        <div>
                          <L>Sub-status</L>
                          <select
                            className="qf"
                            value={form.sub_status}
                            onChange={(e) => {
                              const v = e.target.value
                              // „Nu răspunde" → follow-up implicit peste o săptămână
                              // (editabil) dacă nu e deja setat.
                              setForm((prev) => ({
                                ...prev,
                                sub_status: v,
                                data_callback_dorit:
                                  v === 'nu_raspunde' && !prev.data_callback_dorit
                                    ? dataPesteZile(7)
                                    : prev.data_callback_dorit,
                              }))
                            }}
                            style={{ ...selectStyle, border: '1px solid #F0D98A' }}
                          >
                            <option value="">— niciun sub-status —</option>
                            {SUB_STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <L req>Data follow-up</L>
                          <input className="qf" type="date" value={form.data_callback_dorit} onChange={(e) => set('data_callback_dorit', e.target.value)} style={{ ...inputStyle, border: '1px solid #F0D98A' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* condițional: PIERDUT */}
                  {form.status === 'pierdut' && (
                    <div style={{ marginTop: '18px', border: '1px solid #F0C9C9', background: '#FDF1F1', borderRadius: '13px', padding: '15px 16px' }}>
                      <L>Motiv pierdut</L>
                      <input className="qf" value={form.motiv_pierdut} onChange={(e) => set('motiv_pierdut', e.target.value)} placeholder="Ex: preț, distanță, a ales alt studio…" style={{ ...inputStyle, border: '1px solid #ECC4C4' }} />
                    </div>
                  )}

                  {/* DATE CONTACT */}
                  <div style={{ ...sectionLabel, marginTop: '22px' }}>Date contact</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px', marginTop: '11px' }}>
                    <div>
                      <L>Prenume</L>
                      <input className="qf" value={form.prenume} onChange={(e) => set('prenume', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <L req>Nume</L>
                      <input className="qf" value={form.nume} onChange={(e) => set('nume', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <L req>Telefon</L>
                      <input className="qf" value={form.telefon} onChange={(e) => { set('telefon', e.target.value); setDupWarning(null) }} onBlur={(e) => void checkDup(e.target.value)} style={inputStyle} />
                      {dupWarning && <div style={{ fontSize: '11.5px', color: '#C2403F', marginTop: '5px' }}>{dupWarning}</div>}
                    </div>
                    <div>
                      <L>Email</L>
                      <input className="qf" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <L>Nume părinte</L>
                      <input className="qf" value={form.nume_parinte} onChange={(e) => set('nume_parinte', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <L>Data nașterii</L>
                      <input className="qf" type="date" value={form.data_nasterii} onChange={(e) => set('data_nasterii', e.target.value)} style={inputStyle} />
                    </div>
                  </div>

                  {/* PROFIL & INTERES */}
                  <div style={{ ...sectionLabel, marginTop: '22px' }}>Profil &amp; interes</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px', marginTop: '11px' }}>
                    <div>
                      <L req>Sursă (campanie)</L>
                      <select className="qf" value={form.sursa} onChange={(e) => set('sursa', e.target.value)} style={selectStyle}>
                        <option value="">— selectează —</option>
                        {(campanii.data ?? []).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <L>Locație preferată</L>
                      <select className="qf" value={form.locatia} onChange={(e) => set('locatia', e.target.value)} style={selectStyle}>
                        <option value="">— selectează —</option>
                        {LOCATII.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <L>Interes</L>
                      <select className="qf" value={form.interes} onChange={(e) => set('interes', e.target.value)} style={selectStyle}>
                        <option value="">— selectează —</option>
                        {INTERESE.map((i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <L>Grupă vârstă</L>
                      <select className="qf" value={form.grupa_varsta} onChange={(e) => set('grupa_varsta', e.target.value)} style={selectStyle}>
                        <option value="">— selectează —</option>
                        {GRUPE.map((g) => (
                          <option key={g} value={g}>{GRUPA_LABELS[g]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* OBSERVAȚII */}
                  <div style={{ marginTop: '18px' }}>
                    <L>Observații</L>
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
