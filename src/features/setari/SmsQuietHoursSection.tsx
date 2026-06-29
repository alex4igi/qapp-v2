import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, TextInput, Checkbox, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isPrivileged } from '@/lib/rolesMatrix'
import { humanizeError } from '@/lib/errorMessage'
import { getSmsQuietHours, saveSmsQuietHours, type QuietHoursConfig } from './api'

// Fereastra în care NU se trimit SMS-uri (zonă interzisă). Mesajele declanșate în
// acest interval se amână automat și pleacă la ora `end`. Editabilă de manager+.
export function SmsQuietHoursSection() {
  const { role } = useAuth()
  const canEdit = isPrivileged(role)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<QuietHoursConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const cfgQuery = useQuery({ queryKey: ['sms_quiet_hours'], queryFn: getSmsQuietHours })

  useEffect(() => {
    if (cfgQuery.data && !form) setForm(cfgQuery.data)
  }, [cfgQuery.data, form])

  const save = useMutation({
    mutationFn: () => saveSmsQuietHours(form!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sms_quiet_hours'] })
      setSaved(true)
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (!form) return
    if (!/^\d{2}:\d{2}$/.test(form.start) || !/^\d{2}:\d{2}$/.test(form.end)) {
      setError('Orele trebuie completate (format HH:MM).')
      return
    }
    save.mutate()
  }

  const set = (patch: Partial<QuietHoursConfig>) => {
    setSaved(false)
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold text-quasar-black">Zonă interzisă SMS</h2>
      </div>
      <p className="mb-3 text-sm text-quasar-gray">
        Interval în care NU se trimit SMS-uri către contacte (ore târzii). Mesajele
        declanșate în acest interval — confirmări, follow-up, listă de așteptare,
        review și trimiteri manuale în masă — se amână automat și pleacă la ora de
        final. Fus orar: Europe/Bucharest.
      </p>

      {cfgQuery.isLoading || !form ? (
        <Spinner />
      ) : (
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
          <Checkbox
            id="quiet-enabled"
            label="Zonă interzisă activă"
            checked={form.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            disabled={!canEdit}
          />
          <div className="flex gap-4">
            <Field label="De la ora" htmlFor="quiet-start">
              <TextInput
                id="quiet-start"
                type="time"
                value={form.start}
                onChange={(e) => set({ start: e.target.value })}
                disabled={!canEdit || !form.enabled}
              />
            </Field>
            <Field label="Până la ora" htmlFor="quiet-end">
              <TextInput
                id="quiet-end"
                type="time"
                value={form.end}
                onChange={(e) => set({ end: e.target.value })}
                disabled={!canEdit || !form.enabled}
              />
            </Field>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && !save.isPending && (
            <p className="text-sm text-green-700">Salvat.</p>
          )}
          {canEdit && (
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Se salvează…' : 'Salvează'}
            </Button>
          )}
        </form>
      )}
    </section>
  )
}
