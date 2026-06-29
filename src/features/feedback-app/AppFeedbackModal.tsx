import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextInput, TextArea, Select, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import type { AppFeedbackTip } from '@/types/db'
import { tipOptions } from './constants'
import { createAppFeedback } from './api'

type Props = {
  open: boolean
  onClose: () => void
}

const EMPTY = { tip: '' as AppFeedbackTip | '', titlu: '', detalii: '' }

export function AppFeedbackModal({ open, onClose }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const reset = () => {
    setForm(EMPTY)
    setError(null)
    setSent(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const save = useMutation({
    mutationFn: () =>
      createAppFeedback({
        tip: form.tip as AppFeedbackTip,
        titlu: form.titlu.trim(),
        detalii: form.detalii.trim() || null,
        pagina: window.location.pathname,
        user_agent: navigator.userAgent,
        autor_email: user?.email ?? null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app-feedback'] })
      void queryClient.invalidateQueries({ queryKey: ['notificari-unread'] })
      setSent(true)
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la trimitere.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.tip) {
      setError('Alege tipul feedback-ului.')
      return
    }
    if (!form.titlu.trim()) {
      setError('Scrie un titlu scurt.')
      return
    }
    save.mutate()
  }

  if (sent) {
    return (
      <Modal open={open} title="Feedback trimis" onClose={handleClose}>
        <div className="space-y-4 py-2 text-center">
          <div className="text-4xl">✅</div>
          <p className="text-sm text-quasar-black">
            Mulțumim! Feedback-ul a ajuns la echipă. Îl vei putea urmări în
            pagina <span className="font-medium">Feedback aplicație</span>, unde
            apare și răspunsul nostru.
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
      title="💬 Trimite feedback"
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="app-feedback-form"
            disabled={save.isPending}
          >
            {save.isPending ? 'Se trimite…' : 'Trimite'}
          </Button>
        </>
      }
    >
      <form id="app-feedback-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-quasar-gray">
          Un bug, o idee sau o întrebare despre aplicație? Scrie aici și ajunge
          direct la echipă.
        </p>

        <Field label="Tip" htmlFor="tip" required>
          <Select
            id="tip"
            placeholder="— alege —"
            options={tipOptions}
            value={form.tip}
            onChange={(e) => set('tip', e.target.value as AppFeedbackTip)}
          />
        </Field>

        <Field label="Titlu" htmlFor="titlu" required>
          <TextInput
            id="titlu"
            placeholder="Pe scurt, despre ce e vorba"
            value={form.titlu}
            onChange={(e) => set('titlu', e.target.value)}
            maxLength={120}
          />
        </Field>

        <Field label="Detalii" htmlFor="detalii">
          <TextArea
            id="detalii"
            rows={4}
            placeholder="Ce ai făcut, ce te-ai așteptat să se întâmple, ce s-a întâmplat de fapt…"
            value={form.detalii}
            onChange={(e) => set('detalii', e.target.value)}
          />
        </Field>

        <p className="text-xs text-quasar-gray">
          Trimitem automat și pagina curentă ({window.location.pathname}) ca să
          găsim mai ușor problema.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
