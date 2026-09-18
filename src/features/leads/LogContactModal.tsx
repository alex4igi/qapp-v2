import { humanizeError } from '@/lib/errorMessage'
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextArea, DateInput, Button } from '@/components/ui'
import type { Lead } from '@/types/db'
import { dataPesteZile, dataUrmatoareiIncercari, type ModMotiv } from './constants'
import { logContact, type CanalContact } from './api'

// Ce se întâmplă mai departe, când omul A RĂSPUNS. Obligatoriu de ales: până
// acum „Reușit" golea sub-statusul și lăsa leadul în „Contactat" fără nicio
// dată — o stare pe care nicio regulă n-o mai atingea (6 leaduri în limbo, cel
// mai vechi de 70 de zile). Fiecare variantă de aici duce undeva.
type Pas = 'programeaza' | 'de_revenit' | 'waiting' | 'pierdut' | 'nurture'

const PASI: { value: Pas; label: string; ajutor: string }[] = [
  { value: 'programeaza', label: 'Vine la o ședință', ajutor: 'Deschide programarea: dată + grupă.' },
  { value: 'de_revenit', label: 'Revine la o dată', ajutor: 'Rămâne în Contactat, cu data pe care a cerut-o el.' },
  { value: 'waiting', label: 'Nu e loc la ce vrea', ajutor: 'Lista de așteptare.' },
  { value: 'nurture', label: 'Nu acum', ajutor: 'Program, preț, distanță, altă activitate → Nurture.' },
  { value: 'pierdut', label: 'Nu mai vrea deloc', ajutor: 'Pierdut — nu-l mai contactăm niciodată.' },
]

type Props = {
  open: boolean
  lead: Lead
  onClose: () => void
  /** Pașii care continuă în alt modal. Fără ei, variantele respective nu apar. */
  onSchedule?: (lead: Lead) => void
  onWaitingList?: (lead: Lead) => void
  onMotiv?: (lead: Lead, mod: ModMotiv) => void
}

const CANALE: { value: CanalContact; label: string; icon: string }[] = [
  { value: 'telefon', label: 'Telefon', icon: '📞' },
  { value: 'sms', label: 'SMS', icon: '💬' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'dm', label: 'DM', icon: '📩' },
]

export function LogContactModal({
  open,
  lead,
  onClose,
  onSchedule,
  onWaitingList,
  onMotiv,
}: Props) {
  const queryClient = useQueryClient()
  const [canal, setCanal] = useState<CanalContact>('telefon')
  const [aRaspuns, setARaspuns] = useState<boolean | null>(null)
  const [pas, setPas] = useState<Pas | null>(null)
  const [observatii, setObservatii] = useState('')
  const [dataCallback, setDataCallback] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCanal('telefon')
    setARaspuns(null)
    setPas(null)
    setObservatii('')
    setDataCallback('')
    setError(null)
  }, [open])

  const pasiDisponibili = PASI.filter(
    (p) =>
      (p.value !== 'programeaza' || onSchedule) &&
      (p.value !== 'waiting' || onWaitingList) &&
      (p.value !== 'pierdut' || onMotiv) &&
      (p.value !== 'nurture' || onMotiv),
  )

  // Pașii care continuă în alt modal scriu întâi „de revenit, azi". E plasa:
  // dacă recepția închide modalul-copil, leadul rămâne cu un pas următor, nu în
  // limbo. Modalul-copil suprascrie imediat ce se salvează.
  const save = useMutation({
    mutationFn: () =>
      logContact({
        leadId: lead.id,
        canal,
        rezultat: 'follow_up',
        observatii,
        subStatus: aRaspuns ? 'de_revenit' : 'nu_raspunde',
        dataCallback: pas === 'de_revenit' || !aRaspuns ? dataCallback : dataPesteZile(0),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['scorecard'] })
      if (pas === 'programeaza') onSchedule?.(lead)
      else if (pas === 'waiting') onWaitingList?.(lead)
      else if (pas === 'pierdut') onMotiv?.(lead, 'pierdut')
      else if (pas === 'nurture') onMotiv?.(lead, 'nurture')
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la logare.')),
  })

  const handleSave = () => {
    if (aRaspuns === null) {
      setError('Spune dacă a răspuns sau nu.')
      return
    }
    if (aRaspuns && !pas) {
      setError('Alege ce urmează. Un lead contactat are mereu un pas următor.')
      return
    }
    if ((!aRaspuns || pas === 'de_revenit') && !dataCallback) {
      setError(aRaspuns ? 'Pune data la care revii.' : 'Pune data următoarei încercări.')
      return
    }
    setError(null)
    save.mutate()
  }

  const fullName =
    [lead.prenume, lead.nume].filter(Boolean).join(' ') || lead.nume

  return (
    <Modal
      open={open}
      title={`Loghează contact — ${fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează contactul'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Canal">
          <div className="flex flex-wrap gap-2">
            {CANALE.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCanal(c.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  canal === c.value
                    ? 'border-quasar-yellow bg-quasar-yellow/10 font-medium text-quasar-black'
                    : 'border-quasar-gray-light text-quasar-gray hover:border-quasar-yellow'
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="A răspuns?" required>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setARaspuns(true)
                setPas(null)
                setDataCallback('')
                setError(null)
              }}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                aRaspuns === true
                  ? 'border-emerald-300 bg-emerald-50 font-medium text-emerald-700'
                  : 'border-quasar-gray-light text-quasar-gray hover:border-quasar-yellow'
              }`}
            >
              Da, am vorbit
            </button>
            <button
              type="button"
              onClick={() => {
                setARaspuns(false)
                setPas(null)
                setDataCallback(dataUrmatoareiIncercari(lead.nr_contactari ?? 0))
                setError(null)
              }}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                aRaspuns === false
                  ? 'border-red-300 bg-red-50 font-medium text-red-700'
                  : 'border-quasar-gray-light text-quasar-gray hover:border-quasar-yellow'
              }`}
            >
              Nu a răspuns
            </button>
          </div>
        </Field>

        {aRaspuns === true && (
          <Field label="Ce urmează?" required>
            <div className="flex flex-wrap gap-1.5">
              {pasiDisponibili.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  title={p.ajutor}
                  onClick={() => {
                    setPas(p.value)
                    if (p.value === 'de_revenit' && !dataCallback)
                      setDataCallback(dataPesteZile(3))
                    setError(null)
                  }}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    pas === p.value
                      ? 'border-quasar-yellow bg-quasar-yellow/20 font-medium text-quasar-black'
                      : 'border-quasar-gray-light bg-white text-quasar-gray hover:border-quasar-gray'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {pas && (
              <p className="mt-1.5 text-xs text-quasar-gray">
                {PASI.find((p) => p.value === pas)?.ajutor}
              </p>
            )}
          </Field>
        )}

        {(aRaspuns === false || pas === 'de_revenit') && (
          <Field
            label={aRaspuns ? 'Revenim pe' : 'Reîncercăm pe'}
            required
            htmlFor="lc-callback"
          >
            <DateInput
              id="lc-callback"
              value={dataCallback}
              onChange={(e) => setDataCallback(e.target.value)}
            />
            {!aRaspuns && (
              <p className="mt-1 text-xs text-quasar-gray">
                Cadența: 3 încercări în 5 zile — azi, mâine la altă oră, apoi
                peste 2–3 zile. A {Math.min((lead.nr_contactari ?? 0) + 1, 3)}-a
                încercare din 3.
              </p>
            )}
          </Field>
        )}

        <Field label="Observații" htmlFor="lc-obs">
          <TextArea
            id="lc-obs"
            value={observatii}
            onChange={(e) => setObservatii(e.target.value)}
            placeholder="ex: interesat, revine după ce vorbește cu părintele"
          />
          <p className="mt-1 text-xs text-quasar-gray">
            Notează ce ați discutat — un contact fără notă scade scorul de igienă
            CRM.
          </p>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
