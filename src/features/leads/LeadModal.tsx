import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { campaniiOptions, locatiiOptions, sezonActivId } from '@/lib/lookups'
import type { Lead, GrupaLead } from '@/types/db'
import {
  ALL_STATUS_COLUMNS,
  SUB_STATUS_OPTIONS,
  INTERESE,
  GRUPE,
  GRUPA_LABELS,
  GRUPA_TO_VARSTA_CURS,
  LOCATII,
  ZILE_SAPTAMANA,
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
      ? lead.data_callback_dorit.slice(0, 16)
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
  const { role } = useAuth()
  const isEdit = Boolean(lead)
  const [form, setForm] = useState<LeadForm>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<'detalii' | 'istoric'>('detalii')
  const [showLogContact, setShowLogContact] = useState(false)
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
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteLead(lead!.id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
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
      setError(e instanceof Error ? e.message : 'Eroare la mutare.'),
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
    save.mutate()
  }

  return (
    <>
    <Modal
      open={open}
      title={isEdit ? 'Editare lead' : 'Lead nou'}
      onClose={onClose}
      footer={
        <>
          {isEdit && isAdminOrHigher(role) && tab === 'detalii' && (
            <div className="mr-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-sm text-quasar-gray">
                    Confirmi ștergerea?
                  </span>
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Șterge
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Nu
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Șterge lead
                </Button>
              )}
            </div>
          )}
          {isEdit && lead && tab === 'detalii' && (
            <>
              {waLink(form.telefon) && (
                <a
                  href={waLink(form.telefon, waLeadMessage(form))!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
                >
                  WhatsApp
                </a>
              )}
              <Button
                variant="secondary"
                onClick={() => setShowLogContact(true)}
              >
                📞 Loghează contact
              </Button>
              {lead.status !== 'nurture' && (
                <Button
                  variant="secondary"
                  disabled={moveToNurture.isPending}
                  onClick={() => moveToNurture.mutate()}
                >
                  {moveToNurture.isPending ? 'Se mută…' : '🌱 Mută în Nurture'}
                </Button>
              )}
            </>
          )}
          <Button variant="secondary" onClick={onClose}>
            {tab === 'istoric' ? 'Închide' : 'Anulează'}
          </Button>
          {tab === 'detalii' && (
            <Button type="submit" form="lead-form" disabled={save.isPending}>
              {save.isPending
                ? 'Se salvează…'
                : isEdit
                  ? 'Salvează'
                  : 'Adaugă lead'}
            </Button>
          )}
        </>
      }
    >
      {isEdit && lead && (
        <div className="mb-3 flex gap-1 border-b border-quasar-gray-light">
          {(['detalii', 'istoric'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors ${
                tab === t
                  ? 'border-quasar-yellow font-medium text-quasar-black'
                  : 'border-transparent text-quasar-gray hover:text-quasar-black'
              }`}
            >
              {t === 'detalii' ? 'Detalii' : 'Istoric'}
            </button>
          ))}
        </div>
      )}

      {isEdit && lead && tab === 'istoric' && (
        <LeadHistory leadId={lead.id} />
      )}

      <form
        id="lead-form"
        onSubmit={handleSubmit}
        className={tab === 'istoric' ? 'hidden' : 'space-y-3'}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prenume" htmlFor="prenume">
            <TextInput
              id="prenume"
              value={form.prenume}
              onChange={(e) => set('prenume', e.target.value)}
            />
          </Field>
          <Field label="Nume" required htmlFor="nume">
            <TextInput
              id="nume"
              value={form.nume}
              onChange={(e) => set('nume', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Telefon"
            required
            htmlFor="telefon"
            error={dupWarning ?? undefined}
          >
            <TextInput
              id="telefon"
              value={form.telefon}
              onChange={(e) => {
                set('telefon', e.target.value)
                setDupWarning(null)
              }}
              onBlur={(e) => void checkDup(e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nume părinte" htmlFor="nume_parinte">
            <TextInput
              id="nume_parinte"
              value={form.nume_parinte}
              onChange={(e) => set('nume_parinte', e.target.value)}
            />
          </Field>
          <Field label="Data nașterii" htmlFor="data_nasterii">
            <DateInput
              id="data_nasterii"
              value={form.data_nasterii}
              onChange={(e) => set('data_nasterii', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sursă (campanie)" required htmlFor="sursa">
            <Select
              id="sursa"
              placeholder="— selectează —"
              options={campanii.data ?? []}
              value={form.sursa}
              onChange={(e) => set('sursa', e.target.value)}
            />
          </Field>
          <Field label="Locație preferată" htmlFor="locatia">
            <Select
              id="locatia"
              placeholder="— selectează —"
              options={LOCATII.map((l) => ({ label: l, value: l }))}
              value={form.locatia}
              onChange={(e) => set('locatia', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Interes" htmlFor="interes">
            <Select
              id="interes"
              placeholder="— selectează —"
              options={INTERESE.map((i) => ({ label: i, value: i }))}
              value={form.interes}
              onChange={(e) => set('interes', e.target.value)}
            />
          </Field>
          <Field label="Grupă vârstă" htmlFor="grupa_varsta">
            <Select
              id="grupa_varsta"
              placeholder="— selectează —"
              options={GRUPE.map((g) => ({
                label: GRUPA_LABELS[g],
                value: g,
              }))}
              value={form.grupa_varsta}
              onChange={(e) => set('grupa_varsta', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              options={ALL_STATUS_COLUMNS.map((c) => ({
                label: c.label,
                value: c.status,
              }))}
              value={form.status}
              onChange={(e) =>
                set('status', e.target.value as LeadForm['status'])
              }
            />
          </Field>
          <Field label="Data programare" htmlFor="data_programare">
            <DateInput
              id="data_programare"
              value={form.data_programare}
              onChange={(e) => {
                set('data_programare', e.target.value)
                // Date-driven: setarea datei marchează intenția de programare.
                if (e.target.value) set('status', 'programat')
              }}
            />
          </Field>
        </div>

        {/* Programare la o grupă: aleg data → apar cursurile/evenimentele zilei.
            La salvare, leadul devine „Programat" și intră în rosterul grupei. */}
        {form.status === 'programat' && (
          <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-3">
            {form.data_programare ? (
              <Field label="Curs / eveniment" required htmlFor="sch-curs">
                <Select
                  id="sch-curs"
                  placeholder={
                    cursuriQ.isLoading ? 'Se încarcă…' : '— selectează —'
                  }
                  options={optiuni}
                  value={selectie}
                  onChange={(e) => setSelectie(e.target.value)}
                />
              </Field>
            ) : (
              <p className="text-xs text-blue-800">
                Setează data programării ca să vezi cursurile și evenimentele din
                acea zi.
              </p>
            )}
            <p className="text-xs text-blue-800">
              La salvare leadul apare în rosterul grupei din acea zi. Confirmarea
              prin SMS se trimite după 2 minute (timp de corecții). Data nașterii
              nu e obligatorie.
            </p>
          </div>
        )}

        {form.status === 'contactat' && (
          <Field label="Sub-status" htmlFor="sub_status">
            <Select
              id="sub_status"
              placeholder="— niciun sub-status —"
              options={SUB_STATUS_OPTIONS.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              value={form.sub_status}
              onChange={(e) => set('sub_status', e.target.value)}
            />
          </Field>
        )}

        {form.status === 'pierdut' && (
          <Field label="Motiv pierdut" htmlFor="motiv_pierdut">
            <TextInput
              id="motiv_pierdut"
              value={form.motiv_pierdut}
              onChange={(e) => set('motiv_pierdut', e.target.value)}
            />
          </Field>
        )}

        {isEdit && lead && (lead.nr_contactari > 0 || lead.flag_reminder) && (
          <div className="flex items-center gap-4 rounded-md bg-quasar-gray-light px-3 py-2 text-xs text-quasar-gray">
            {lead.nr_contactari > 0 && (
              <span>
                Contactări fără răspuns:{' '}
                <span
                  className={
                    lead.nr_contactari >= 3
                      ? 'font-semibold text-amber-600'
                      : 'font-semibold text-quasar-black'
                  }
                >
                  {lead.nr_contactari}
                </span>
              </span>
            )}
            {lead.flag_reminder && (
              <span className="font-medium text-red-600">
                ⚑ Marcat pentru revenire
              </span>
            )}
          </div>
        )}

        <Field label="Observații" htmlFor="observatii">
          <TextArea
            id="observatii"
            value={form.observatii}
            onChange={(e) => set('observatii', e.target.value)}
          />
        </Field>

        {isEdit && lead && (
          <OptOutSection
            entity="lead"
            id={lead.id}
            optOut={lead.opt_out_marketing ?? false}
            motiv={lead.opt_out_motiv ?? null}
            la={lead.opt_out_la ?? null}
            invalidateKey={['leads']}
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
    {isEdit && lead && (
      <LogContactModal
        open={showLogContact}
        lead={lead}
        onClose={() => setShowLogContact(false)}
      />
    )}
    </>
  )
}
