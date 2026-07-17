import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  Select,
  TextInput,
  TextArea,
  Button,
  Spinner,
} from '@/components/ui'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { previewAnuntClient, sendAnuntClient } from './api'

type Props = {
  open: boolean
  onClose: () => void
}

// Mesaj de la instructor/manager către membrii unei grupe. Ajunge în 🔔 din
// portalul membrilor (canalul 'client'). One-way: fără răspuns.
export function ComposeMesajGrupaModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()

  const [cursId, setCursId] = useState('')
  const [titlu, setTitlu] = useState('')
  const [continut, setContinut] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<number | null>(null)

  const cursuriQ = useCursuriOptions({ enabled: open })
  const cursuri = cursuriQ.data ?? []

  const previewQ = useQuery({
    queryKey: ['anunt-client-preview', cursId],
    queryFn: () => previewAnuntClient(cursId || null),
    enabled: open && cursId !== '',
  })

  const reset = () => {
    setCursId('')
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
      sendAnuntClient({
        titlu: titlu.trim(),
        continut: continut.trim(),
        cursId: cursId || null,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['anunturi'] })
      setSent(res.nr_destinatari)
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la trimitere.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!cursId) {
      setError('Alege grupa căreia îi trimiți mesajul.')
      return
    }
    if (!titlu.trim()) {
      setError('Scrie un titlu.')
      return
    }
    if (!continut.trim()) {
      setError('Scrie mesajul.')
      return
    }
    save.mutate()
  }

  if (sent != null) {
    return (
      <Modal open={open} title="Mesaj trimis" onClose={handleClose}>
        <div className="space-y-4 py-2 text-center">
          <div className="text-4xl">💬</div>
          <p className="text-sm text-quasar-black">
            Mesajul a fost trimis către{' '}
            <span className="font-medium">{sent}</span>{' '}
            {sent === 1 ? 'membru' : 'membri'}. Apare în 🔔 din portalul lor și
            în tabul <span className="font-medium">Trimise</span>.
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

  return (
    <Modal
      open={open}
      title="💬 Mesaj către grupă"
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="compose-mesaj-grupa-form"
            disabled={save.isPending}
          >
            {save.isPending ? 'Se trimite…' : 'Trimite'}
          </Button>
        </>
      }
    >
      <form
        id="compose-mesaj-grupa-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <p className="text-sm text-quasar-gray">
          Mesajul ajunge în notificările din portalul membrilor grupei. Nu pot
          răspunde — e doar pentru anunțuri (ex. „sâmbătă venim în tricou negru").
        </p>

        <Field label="Grupă" htmlFor="curs" required>
          {cursuriQ.isLoading ? (
            <Spinner />
          ) : (
            <Select
              id="curs"
              options={cursuri}
              placeholder="Alege grupa…"
              value={cursId}
              onChange={(e) => setCursId(e.target.value)}
            />
          )}
        </Field>

        <Field label="Titlu" htmlFor="titlu" required>
          <TextInput
            id="titlu"
            placeholder="Pe scurt, despre ce e vorba"
            value={titlu}
            onChange={(e) => setTitlu(e.target.value)}
            maxLength={120}
          />
        </Field>

        <Field label="Mesaj" htmlFor="continut" required>
          <TextArea
            id="continut"
            rows={5}
            placeholder="Mesajul tău către grupă…"
            value={continut}
            onChange={(e) => setContinut(e.target.value)}
          />
        </Field>

        {cursId !== '' && (
          <p className="text-sm text-quasar-gray">
            {previewQ.isFetching
              ? 'Se calculează destinatarii…'
              : `Vei trimite către ${previewQ.data ?? 0} ${
                  (previewQ.data ?? 0) === 1 ? 'membru' : 'membri'
                }.`}
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
