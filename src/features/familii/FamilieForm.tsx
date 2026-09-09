import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Checkbox,
  Button,
} from '@/components/ui'
import { ChecklistRail } from '@/components/checklist'
import { evalueazaChecklist } from '@/lib/checklist'
import {
  FAMILIE_CHECKLIST,
  type SectiuneFamilie,
} from '@/lib/checklist/specs/familie'
import type { Familie } from '@/types/db'
import { createFamilie, updateFamilie } from './api'
import { createPortalAccount, suggestPortalPassword } from '@/lib/portalAccount'

type Props = {
  open: boolean
  familie?: Familie | null
  onClose: () => void
  /** Deschide formularul derulat la secțiunea unui câmp lipsă (din checklist). */
  focusSection?: SectiuneFamilie
}

type FormState = {
  nume_familie: string
  nume_reprezentant: string
  prenume_reprezentant: string
  email: string
  telefon: string
  telefon_2: string
  metoda_plata: string
  metoda_comunicare: string
  observatii: string
  fara_poze: boolean
}

function initialState(familie?: Familie | null): FormState {
  return {
    nume_familie: familie?.nume_familie ?? '',
    nume_reprezentant: familie?.nume_reprezentant ?? '',
    prenume_reprezentant: familie?.prenume_reprezentant ?? '',
    email: familie?.email ?? '',
    telefon: familie?.telefon ?? '',
    telefon_2: familie?.telefon_2 ?? '',
    metoda_plata: familie?.metoda_plata ?? '',
    metoda_comunicare: familie?.metoda_comunicare ?? '',
    observatii: familie?.observatii ?? '',
    fara_poze: familie?.fara_poze ?? false,
  }
}

export function FamilieForm({ open, familie, onClose, focusSection }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(familie)
  const [form, setForm] = useState<FormState>(() => initialState(familie))
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Datele de firmă nu se editează din modal (stau în tab-ul „Detalii
  // personale"), deci vin din rândul salvat — la fel ca la contul teacherului.
  const checklist = useMemo(
    () =>
      evalueazaChecklist(FAMILIE_CHECKLIST, {
        nume_familie: form.nume_familie.trim(),
        nume_reprezentant: form.nume_reprezentant.trim() || null,
        prenume_reprezentant: form.prenume_reprezentant.trim() || null,
        telefon: form.telefon.trim() || null,
        email: form.email.trim() || null,
        factura_pe_firma: familie?.factura_pe_firma ?? false,
        firma_denumire: familie?.firma_denumire ?? null,
        firma_cif: familie?.firma_cif ?? null,
        firma_adresa: familie?.firma_adresa ?? null,
      }),
    [form, familie],
  )

  // Deschidere din checklistul fișei: derulează la secțiunea câmpului lipsă.
  useEffect(() => {
    if (!open || !focusSection) return
    bodyRef.current
      ?.querySelector(`[data-sectiune="${focusSection}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open, focusSection])
  const [createPortal, setCreatePortal] = useState(false)
  const [portalPwd, setPortalPwd] = useState('')

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const togglePortal = (on: boolean) => {
    setCreatePortal(on)
    if (on && !portalPwd) setPortalPwd(suggestPortalPassword(form.nume_familie))
  }

  const mutation = useMutation({
    mutationFn: async (): Promise<{ warning?: string }> => {
      const payload = {
        nume_familie: form.nume_familie.trim(),
        nume_reprezentant: form.nume_reprezentant.trim() || null,
        prenume_reprezentant: form.prenume_reprezentant.trim() || null,
        email: form.email.trim() || null,
        telefon: form.telefon.trim() || null,
        telefon_2: form.telefon_2.trim() || null,
        metoda_plata: form.metoda_plata.trim() || null,
        metoda_comunicare: form.metoda_comunicare.trim() || null,
        observatii: form.observatii.trim() || null,
        fara_poze: form.fara_poze,
      }
      if (isEdit) {
        await updateFamilie(familie!.id, payload)
        return {}
      }
      const saved = await createFamilie(payload)
      // Cont de portal opțional, după ce familia există (nu blochează salvarea).
      if (createPortal) {
        if (!payload.email) return { warning: 'Familie salvată. Cont portal NEcreat: lipsește emailul.' }
        try {
          const r = await createPortalAccount({
            familieId: saved.id,
            email: payload.email,
            password: portalPwd,
            notify: 'email',
          })
          return r.emailed
            ? {}
            : { warning: `Cont portal creat, dar emailul nu a plecat — parolă: ${portalPwd}` }
        } catch (e) {
          return { warning: `Familie salvată, dar contul de portal a eșuat: ${humanizeError(e)}` }
        }
      }
      return {}
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['familii'] })
      if (isEdit) {
        void queryClient.invalidateQueries({
          queryKey: ['familie', familie!.id],
        })
      }
      if (res?.warning) window.alert(res.warning)
      onClose()
    },
    onError: (e: unknown) => {
      setError(humanizeError(e, 'Eroare la salvare.'))
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.nume_familie.trim()) {
      setError('Numele familiei este obligatoriu.')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează familie' : 'Familie nouă'}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="familie-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <div
        ref={bodyRef}
        className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]"
      >
      <form id="familie-form" onSubmit={handleSubmit} className="min-w-0 space-y-3">
        <div data-sectiune="identitate">
        <Field label="Nume familie" required htmlFor="nume_familie">
          <TextInput
            id="nume_familie"
            value={form.nume_familie}
            onChange={(e) => set('nume_familie', e.target.value)}
          />
        </Field>
        </div>

        <div className="grid grid-cols-2 gap-3" data-sectiune="reprezentant">
          <Field label="Nume reprezentant" htmlFor="nume_rep">
            <TextInput
              id="nume_rep"
              value={form.nume_reprezentant}
              onChange={(e) => set('nume_reprezentant', e.target.value)}
            />
          </Field>
          <Field label="Prenume reprezentant" htmlFor="prenume_rep">
            <TextInput
              id="prenume_rep"
              value={form.prenume_reprezentant}
              onChange={(e) => set('prenume_reprezentant', e.target.value)}
            />
          </Field>
        </div>

        <div data-sectiune="contact" className="space-y-3">
        <Field label="Email" htmlFor="email">
          <TextInput
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefon" htmlFor="telefon">
            <TextInput
              id="telefon"
              value={form.telefon}
              onChange={(e) => set('telefon', e.target.value)}
            />
          </Field>
          <Field label="Telefon 2" htmlFor="telefon2">
            <TextInput
              id="telefon2"
              value={form.telefon_2}
              onChange={(e) => set('telefon_2', e.target.value)}
            />
          </Field>
        </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Metodă plată" htmlFor="metoda_plata">
            <TextInput
              id="metoda_plata"
              value={form.metoda_plata}
              onChange={(e) => set('metoda_plata', e.target.value)}
            />
          </Field>
          <Field label="Metodă comunicare" htmlFor="metoda_com">
            <TextInput
              id="metoda_com"
              value={form.metoda_comunicare}
              onChange={(e) => set('metoda_comunicare', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Observații" htmlFor="observatii">
          <TextArea
            id="observatii"
            value={form.observatii}
            onChange={(e) => set('observatii', e.target.value)}
          />
        </Field>

        <Checkbox
          id="poze"
          label="Nu dorește să apară în poze (refuz GDPR)"
          checked={form.fara_poze}
          onChange={(e) => set('fara_poze', e.target.checked)}
        />

        {!isEdit && (
          <div className="rounded-lg border border-gray-200 p-3">
            <Checkbox
              id="create_portal"
              label="Creează cont de portal pentru familie"
              checked={createPortal}
              onChange={(e) => togglePortal(e.target.checked)}
            />
            {createPortal && (
              <div className="mt-2 space-y-2">
                <Field label="Parolă sugerată (editabilă)" htmlFor="portal_pwd">
                  <div className="flex gap-1">
                    <TextInput
                      id="portal_pwd"
                      value={portalPwd}
                      onChange={(e) => setPortalPwd(e.target.value)}
                    />
                    <button
                      type="button"
                      title="Generează altă parolă"
                      className="rounded-lg border border-gray-200 px-2 text-sm hover:bg-gray-50"
                      onClick={() => setPortalPwd(suggestPortalPassword(form.nume_familie))}
                    >
                      🔄
                    </button>
                  </div>
                </Field>
                <p className="text-xs text-quasar-gray">
                  Datele de acces se trimit pe email-ul familiei
                  {form.email.trim() ? ` (${form.email.trim()})` : ' — completează emailul mai sus'}.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Avertisment NON-BLOCANT: lipsa esențialelor nu oprește salvarea. */}
        {checklist.lipsaEsentiale.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ⚠️ Necompletate:{' '}
            {checklist.lipsaEsentiale.map((x) => x.eticheta).join(', ')}. Poți
            salva oricum — familia rămâne marcată ca fișă incompletă.
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
      <ChecklistRail rezultat={checklist} />
      </div>
    </Modal>
  )
}
