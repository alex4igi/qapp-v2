import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  CheckboxGroup,
  Checkbox,
  Button,
  Spinner,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { LOC_ROLE_OPTIONS } from './constants'
import {
  myAnuntLocatieOptions,
  previewAnuntStaff,
  sendAnuntStaff,
} from './api'

type Props = {
  open: boolean
  onClose: () => void
}

export function ComposeAnuntModal({ open, onClose }: Props) {
  const { role, locatieId } = useAuth()
  const queryClient = useQueryClient()
  const admin = isAdminOrHigher(role)

  const [locRoles, setLocRoles] = useState<string[]>([])
  const [escaladare, setEscaladare] = useState(false)
  const [locatieIds, setLocatieIds] = useState<string[]>([])
  const [titlu, setTitlu] = useState('')
  const [continut, setContinut] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)

  const locatiiQ = useQuery({
    queryKey: ['anunt-locatii', role, locatieId],
    queryFn: () => myAnuntLocatieOptions(role, locatieId),
    enabled: open,
  })

  // Rolurile-țintă efective = rolurile de locație + (escaladare ? admin/owner).
  const targetRoles = useMemo(
    () => [...locRoles, ...(escaladare ? ['admin', 'owner'] : [])],
    [locRoles, escaladare],
  )

  // Pentru ne-admin locațiile sunt obligatorii dacă a ales un rol de locație.
  const needsLocatii = locRoles.length > 0
  const locatiiOk = !needsLocatii || locatieIds.length > 0

  const previewQ = useQuery({
    queryKey: ['anunt-preview', targetRoles, locatieIds],
    queryFn: () => previewAnuntStaff(targetRoles, locatieIds),
    enabled: open && targetRoles.length > 0 && locatiiOk,
  })

  const reset = () => {
    setLocRoles([])
    setEscaladare(false)
    setLocatieIds([])
    setTitlu('')
    setContinut('')
    setError(null)
    setSent(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const save = useMutation({
    mutationFn: () =>
      sendAnuntStaff({
        titlu: titlu.trim(),
        continut: continut.trim(),
        targetRoles,
        targetLocatieIds: locatieIds,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['anunturi'] })
      void queryClient.invalidateQueries({ queryKey: ['notificari-unread'] })
      void queryClient.invalidateQueries({ queryKey: ['notificari'] })
      setSent(res.nr_destinatari)
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la trimitere.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (targetRoles.length === 0) {
      setError('Alege cel puțin un destinatar.')
      return
    }
    if (needsLocatii && locatieIds.length === 0) {
      setError('Alege cel puțin o locație pentru rolurile selectate.')
      return
    }
    if (!titlu.trim()) {
      setError('Scrie un titlu.')
      return
    }
    if (!continut.trim()) {
      setError('Scrie conținutul anunțului.')
      return
    }
    save.mutate()
  }

  if (sent != null) {
    return (
      <Modal open={open} title="Anunț trimis" onClose={handleClose}>
        <div className="space-y-4 py-2 text-center">
          <div className="text-4xl">📢</div>
          <p className="text-sm text-quasar-black">
            Anunțul a fost trimis către{' '}
            <span className="font-medium">{sent}</span>{' '}
            {sent === 1 ? 'persoană' : 'persoane'}. Apare în 🔔 la fiecare
            destinatar și în tabul <span className="font-medium">Trimise</span>.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="secondary" onClick={reset}>
              Trimite altul
            </Button>
            <Button onClick={handleClose}>Închide</Button>
          </div>
        </div>
      </Modal>
    )
  }

  const locatieOptions = locatiiQ.data ?? []

  return (
    <Modal
      open={open}
      title="📢 Anunț nou (staff)"
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Anulează
          </Button>
          <Button type="submit" form="compose-anunt-form" disabled={save.isPending}>
            {save.isPending ? 'Se trimite…' : 'Trimite'}
          </Button>
        </>
      }
    >
      <form id="compose-anunt-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Destinatari (roluri)" htmlFor="roles">
          <CheckboxGroup
            options={LOC_ROLE_OPTIONS}
            value={locRoles}
            onChange={setLocRoles}
          />
        </Field>

        {needsLocatii && (
          <Field label="Locații" htmlFor="locatii">
            {locatiiQ.isLoading ? (
              <Spinner />
            ) : locatieOptions.length === 0 ? (
              <p className="text-sm text-quasar-gray">
                Nu ai locații disponibile pentru aceste roluri.
              </p>
            ) : (
              <>
                <CheckboxGroup
                  options={locatieOptions}
                  value={locatieIds}
                  onChange={setLocatieIds}
                />
                {admin && (
                  <p className="mt-1 text-xs text-quasar-gray">
                    Lasă gol pentru a trimite la toate locațiile.
                  </p>
                )}
              </>
            )}
          </Field>
        )}

        <Checkbox
          label="Și conducerea (Admin / Owner)"
          checked={escaladare}
          onChange={(e) => setEscaladare(e.target.checked)}
        />

        <Field label="Titlu" htmlFor="titlu" required>
          <TextInput
            id="titlu"
            placeholder="Pe scurt, despre ce e vorba"
            value={titlu}
            onChange={(e) => setTitlu(e.target.value)}
            maxLength={120}
          />
        </Field>

        <Field label="Conținut" htmlFor="continut" required>
          <TextArea
            id="continut"
            rows={5}
            placeholder="Mesajul tău către echipă…"
            value={continut}
            onChange={(e) => setContinut(e.target.value)}
          />
        </Field>

        {targetRoles.length > 0 && locatiiOk && (
          <p className="text-sm text-quasar-gray">
            {previewQ.isFetching
              ? 'Se calculează destinatarii…'
              : `Vei trimite către ${previewQ.data ?? 0} ${
                  (previewQ.data ?? 0) === 1 ? 'persoană' : 'persoane'
                }.`}
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
