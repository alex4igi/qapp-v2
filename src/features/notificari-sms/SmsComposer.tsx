import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  Select,
  TextArea,
  Checkbox,
  Button,
  Spinner,
} from '@/components/ui'
import { locatiiOptions, sezoaneOptions, sezonActivId } from '@/lib/lookups'
import { formatRoMobile } from '@/lib/phone'
import { useAuth } from '@/hooks/useAuth'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import {
  SMS_BULK_CODES,
  SMS_BULK_LABEL,
  buildBulkSms,
  type SmsBulkCod,
  type SmsRecipient,
} from './templates'
import {
  getSmsRecipients,
  getClientiVizatiLunaCurenta,
  createSmsQueueBatch,
} from './api'

type Props = {
  open: boolean
  onClose: () => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export function SmsComposer({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const poateMesajLiber = isManagerOrHigher(role)

  const [cod, setCod] = useState<SmsBulkCod>('notificare_restante')
  const [locatie, setLocatie] = useState('')
  const [sezon, setSezon] = useState('')
  const [textLiber, setTextLiber] = useState('')
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const codOptions = useMemo(
    () =>
      SMS_BULK_CODES.filter(
        (c) => c !== 'mesaj_liber' || poateMesajLiber,
      ).map((c) => ({ value: c, label: SMS_BULK_LABEL[c] })),
    [poateMesajLiber],
  )

  const locatii = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions })
  const sezoane = useQuery({ queryKey: ['lookup', 'sezoane'], queryFn: sezoaneOptions })
  const sezonActiv = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })

  // Presetează sezonul activ (o singură dată) — evită trimiterea către oameni
  // din sezoane vechi care nu mai sunt în oraș. Operatorul poate trece pe „Toate".
  const [sezonInit, setSezonInit] = useState(false)
  useEffect(() => {
    if (!sezonInit && sezonActiv.data) {
      setSezon(sezonActiv.data)
      setSezonInit(true)
    }
  }, [sezonInit, sezonActiv.data])

  // mesaj_liber are nevoie de locație (ca să nu trimitem aiurea tuturor).
  const needsLocatie = cod === 'mesaj_liber'
  const recipientsEnabled = open && (!needsLocatie || !!locatie)

  const recipientsQuery = useQuery({
    queryKey: ['sms-recipients', { cod, locatie, sezon }],
    queryFn: () => getSmsRecipients({ cod, locatie, sezon }),
    enabled: recipientsEnabled,
  })

  const dejaTrimisQuery = useQuery({
    queryKey: ['sms-deja-trimis', cod],
    queryFn: () => getClientiVizatiLunaCurenta(cod),
    enabled: open,
  })

  const recipients = recipientsQuery.data ?? []
  const dejaTrimis = dejaTrimisQuery.data ?? new Set<string>()

  // Split valid / invalid după reformatare la standard smslink (07XXXXXXXX).
  const { valizi, invalizi } = useMemo(() => {
    const valizi: Array<SmsRecipient & { telefonFmt: string; alreadySent: boolean }> = []
    const invalizi: SmsRecipient[] = []
    for (const r of recipients) {
      const fmt = formatRoMobile(r.telefon)
      if (fmt) {
        const alreadySent = r.client_ids.some((id) => dejaTrimis.has(id))
        valizi.push({ ...r, telefonFmt: fmt, alreadySent })
      } else {
        invalizi.push(r)
      }
    }
    return { valizi, invalizi }
  }, [recipients, dejaTrimis])

  // Selectat = valid + neselectat manual + (implicit nu cei deja trimiși luna asta).
  const isSelected = (r: { familia_id: string; alreadySent: boolean }) =>
    !deselected.has(r.familia_id) && !r.alreadySent

  const selectedRecipients = valizi.filter(isSelected)

  // Funnel transparent: pornim de la TOȚI datornicii (același număr ca lista de
  // sunat) și arătăm explicit fiecare tăiere (dedup lunar, telefon invalid).
  const nrDatorniciTotal = useMemo(
    () => recipients.reduce((acc, r) => acc + r.client_ids.length, 0),
    [recipients],
  )
  const numereUnice = useMemo(
    () => new Set(valizi.map((r) => r.telefonFmt)).size,
    [valizi],
  )
  const dejaNotificati = valizi.filter((r) => r.alreadySent).length

  const toggle = (familiaId: string) =>
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(familiaId)) next.delete(familiaId)
      else next.add(familiaId)
      return next
    })

  // La reminder_plata textul diferă pentru cei cu preț promo — arătăm ambele
  // variante prezente în selecție, ca operatorul să vadă exact ce pleacă.
  const samplePreviews = useMemo(() => {
    const out: Array<{ eticheta: string | null; text: string }> = []
    const faraPromo = selectedRecipients.find((r) => !r.are_promo)
    const cuPromo = selectedRecipients.find((r) => r.are_promo)
    if (cod === 'reminder_plata') {
      if (faraPromo)
        out.push({ eticheta: 'preț standard', text: buildBulkSms(cod, faraPromo, { textLiber }) })
      if (cuPromo)
        out.push({ eticheta: 'preț promo', text: buildBulkSms(cod, cuPromo, { textLiber }) })
      return out
    }
    const r = selectedRecipients[0]
    if (r) out.push({ eticheta: null, text: buildBulkSms(cod, r, { textLiber }) })
    return out
  }, [cod, selectedRecipients, textLiber])

  const save = useMutation({
    mutationFn: async () => {
      const rows = selectedRecipients.map((r) => ({
        telefon: r.telefonFmt,
        mesaj: buildBulkSms(cod, r, { textLiber }),
        cod_mesaj: cod,
        locatie: locatie || null,
        clienti_vizati: r.client_ids,
        status: 'De trimis' as const,
        data_planificata: todayISO(),
      }))
      return createSmsQueueBatch(rows)
    },
    onSuccess: (n) => {
      void queryClient.invalidateQueries({ queryKey: ['sms-queue'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-deja-trimis'] })
      setError(null)
      onClose()
      void n
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la programare.')),
  })

  const handleSave = () => {
    setError(null)
    if (cod === 'mesaj_liber' && !textLiber.trim()) {
      setError('Scrie textul mesajului.')
      return
    }
    if (selectedRecipients.length === 0) {
      setError('Selectează cel puțin un destinatar.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title="Generează SMS-uri"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            onClick={handleSave}
            disabled={save.isPending || selectedRecipients.length === 0}
          >
            {save.isPending
              ? 'Se programează…'
              : `Programează ${selectedRecipients.length} în coadă`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tip mesaj" htmlFor="cod">
            <Select
              id="cod"
              options={codOptions}
              value={cod}
              onChange={(e) => {
                setCod(e.target.value as SmsBulkCod)
                setDeselected(new Set())
              }}
            />
          </Field>
          <Field label="Locație" htmlFor="loc" required={needsLocatie}>
            <Select
              id="loc"
              placeholder="Toate"
              options={locatii.data ?? []}
              value={locatie}
              onChange={(e) => setLocatie(e.target.value)}
            />
          </Field>
          <Field label="Sezon" htmlFor="sez">
            <Select
              id="sez"
              placeholder="Toate"
              options={sezoane.data ?? []}
              value={sezon}
              onChange={(e) => setSezon(e.target.value)}
            />
          </Field>
        </div>

        {cod === 'mesaj_liber' && (
          <Field label="Text mesaj (fără diacritice)" htmlFor="text" required>
            <TextArea
              id="text"
              rows={3}
              value={textLiber}
              onChange={(e) => setTextLiber(e.target.value)}
              placeholder="Textul SMS-ului (se trimite identic tuturor celor selectați)…"
            />
          </Field>
        )}

        {needsLocatie && !locatie ? (
          <p className="text-sm text-quasar-gray">
            Alege o locație pentru a încărca destinatarii.
          </p>
        ) : recipientsQuery.isLoading ? (
          <Spinner />
        ) : recipientsQuery.isError ? (
          <p className="text-sm text-red-600">Eroare la încărcarea destinatarilor.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-quasar-yellow/10 px-3 py-2 text-sm">
              <span className="font-medium">
                {nrDatorniciTotal}{' '}
                {cod === 'mesaj_liber' ? 'persoane' : 'datornici'} ·{' '}
                {numereUnice} numere unice · {selectedRecipients.length}{' '}
                selectate
              </span>
              {dejaNotificati > 0 && (
                <span className="text-quasar-gray">
                  {dejaNotificati} deja notificați luna aceasta
                </span>
              )}
              {invalizi.length > 0 && (
                <span className="text-red-600">
                  {invalizi.length} cu telefon invalid
                </span>
              )}
            </div>

            {/* Listă selecție cu checkbox-uri */}
            <div className="max-h-72 overflow-y-auto rounded-md border border-quasar-gray-light">
              {valizi.length === 0 ? (
                <p className="p-3 text-sm text-quasar-gray">
                  Niciun destinatar cu telefon valid pentru acest filtru.
                </p>
              ) : (
                <ul className="divide-y divide-quasar-gray-light">
                  {valizi.map((r) => (
                    <li
                      key={r.familia_id}
                      className="flex items-start justify-between gap-3 px-3 py-2"
                    >
                      <Checkbox
                        id={`r-${r.familia_id}`}
                        checked={isSelected(r)}
                        disabled={r.alreadySent}
                        onChange={() => toggle(r.familia_id)}
                        label={
                          <span>
                            <span className="font-medium">{r.telefonFmt}</span>{' '}
                            <span className="text-quasar-gray">
                              — {r.membri.map((m) => m.nume).join(', ')}
                            </span>
                            {cod === 'reminder_plata' && r.are_promo && (
                              <span className="ml-2 rounded bg-quasar-yellow/40 px-1.5 py-0.5 text-xs font-medium text-quasar-black">
                                pret promo
                              </span>
                            )}
                            {r.alreadySent && (
                              <span className="ml-2 text-xs text-quasar-gray">
                                (trimis luna aceasta)
                              </span>
                            )}
                          </span>
                        }
                      />
                      {cod !== 'mesaj_liber' && (
                        <span className="whitespace-nowrap text-sm font-medium text-quasar-black">
                          {Math.round(r.total_restanta)} RON
                          {cod === 'avertisment_loc' && r.zile_depasire != null && (
                            <span className="ml-1 text-xs text-red-600">
                              · {r.zile_depasire}z
                            </span>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Datornici cu telefon invalid — de corectat în fișa familiei */}
            {invalizi.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                <p className="mb-1 font-medium text-red-700">
                  Telefon invalid / incomplet — de corectat în fișa familiei:
                </p>
                <ul className="space-y-0.5 text-red-700">
                  {invalizi.map((r) => (
                    <li key={r.familia_id}>
                      {r.membri.map((m) => m.nume).join(', ')} —{' '}
                      <span className="font-mono">{r.telefon || '(lipsă)'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {samplePreviews.length > 0 && (
              <Field label="Previzualizare mesaj">
                <div className="space-y-2">
                  {samplePreviews.map((s) => (
                    <p
                      key={s.eticheta ?? 'unic'}
                      className="rounded-md bg-quasar-gray-light/30 p-3 text-sm text-quasar-black"
                    >
                      {s.eticheta && (
                        <span className="mr-2 text-xs font-medium text-quasar-gray">
                          {s.eticheta}:
                        </span>
                      )}
                      {s.text}
                      <span className="ml-2 text-xs text-quasar-gray">
                        ({s.text.length} car.)
                      </span>
                    </p>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
