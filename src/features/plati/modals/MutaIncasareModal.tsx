import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Field, Modal, Spinner, TextArea, TextInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatDate, formatMonth, formatRON } from '@/lib/format'
import { metodaTone } from '@/lib/metodaPlata'
import { useClientSearch } from '@/components/layout/useClientSearch'
import { calcAge } from '@/features/clienti/pages/ClientProfilePage/helpers'
import {
  listColegiCuRest,
  listIncasariLuna,
  listLuniCuRest,
  mutaIncasareLaAltClient,
  verificaMutareIncasare,
  type LunaCuRest,
  type MutareIncasareRezultat,
  type MutareParte,
} from '../api/muta-incasare'

type Props = {
  open: boolean
  onClose: () => void
  clientId: string
  clientNume: string
  luna: {
    id_enrollment: string
    data_incepere: string
    id_curs: string
    nume_curs: string
  }
}

type ClientAles = { id: string; nume: string }

const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7)

export function MutaIncasareModal({ open, onClose, clientId, clientNume, luna }: Props) {
  const navigate = useNavigate()
  const search = useClientSearch()
  const [incasareId, setIncasareId] = useState<string | null>(null)
  const [tinta, setTinta] = useState<ClientAles | null>(null)
  const [tintaEnrollmentId, setTintaEnrollmentId] = useState<string | null>(null)
  const [motiv, setMotiv] = useState('')
  const [rezultat, setRezultat] = useState<MutareIncasareRezultat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const incasariQ = useQuery({
    queryKey: ['mutare-incasari-luna', luna.id_enrollment],
    queryFn: () => listIncasariLuna(luna.id_enrollment),
    enabled: open,
  })

  const colegiQ = useQuery({
    queryKey: ['mutare-colegi', luna.id_curs, luna.data_incepere, clientId],
    queryFn: () =>
      listColegiCuRest({
        cursId: luna.id_curs,
        dataIncepere: luna.data_incepere,
        excludeClientId: clientId,
      }),
    enabled: open,
  })

  const luniQ = useQuery({
    queryKey: ['mutare-luni-cu-rest', tinta?.id],
    queryFn: () => listLuniCuRest(tinta!.id),
    enabled: open && Boolean(tinta),
  })

  const pozitive = useMemo(
    () => (incasariQ.data ?? []).filter((i) => i.suma > 0),
    [incasariQ.data],
  )

  useEffect(() => {
    if (!incasareId && pozitive.length === 1) setIncasareId(pozitive[0].id)
  }, [incasareId, pozitive])

  // Luna echivalentă (același curs, aceeași lună) e aproape mereu cea corectă.
  useEffect(() => {
    if (tintaEnrollmentId || !luniQ.data) return
    const luni = luniQ.data
    const potrivita =
      luni.find((l) => l.id_curs === luna.id_curs && sameMonth(l.data_incepere, luna.data_incepere)) ??
      (luni.length === 1 ? luni[0] : null)
    if (potrivita) setTintaEnrollmentId(potrivita.id_enrollment)
  }, [luniQ.data, tintaEnrollmentId, luna.id_curs, luna.data_incepere])

  // Fișele, rosterele și restanțele se reîmprospătează singure după mutare
  // (MutationCache din main.tsx invalidează tot).
  const muta = useMutation({
    mutationFn: () =>
      mutaIncasareLaAltClient({
        incasareId: incasareId!,
        enrollmentSursaId: luna.id_enrollment,
        enrollmentTintaId: tintaEnrollmentId!,
        motiv,
      }),
    onSuccess: (res) => setRezultat(res),
    onError: (e: unknown) => {
      setError(humanizeError(e, 'Mutarea nu a reușit.'))
      void incasariQ.refetch()
      void luniQ.refetch()
    },
  })

  // Oprită cât rulează mutarea: invalidarea globală de după succes ar re-verifica
  // o plată care nu mai e pe luna sursă. După o eroare se re-activează și
  // re-verifică singură, ca fereastra să arate starea reală.
  const verificareQ = useQuery({
    queryKey: ['mutare-verificare', incasareId, luna.id_enrollment, tintaEnrollmentId],
    queryFn: () =>
      verificaMutareIncasare({
        incasareId: incasareId!,
        enrollmentSursaId: luna.id_enrollment,
        enrollmentTintaId: tintaEnrollmentId!,
      }),
    enabled:
      open && !rezultat && !muta.isPending && Boolean(incasareId && tintaEnrollmentId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })

  const alegeClient = (c: ClientAles) => {
    setTinta(c)
    setTintaEnrollmentId(null)
    setError(null)
    search.reset()
  }

  const handleSubmit = () => {
    setError(null)
    if (!motiv.trim()) {
      setError('Motivul e obligatoriu.')
      return
    }
    muta.mutate()
  }

  if (rezultat) {
    return (
      <Modal
        open={open}
        title="Plata a fost mutată"
        onClose={onClose}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Închide
            </Button>
            <Button
              onClick={() => {
                onClose()
                navigate(`/clienti/${rezultat.tinta.client_id}`)
              }}
            >
              Deschide fișa lui {rezultat.tinta.client_nume}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            ✅ {formatRON(rezultat.incasare.suma)} {rezultat.incasare.metoda ?? ''} din{' '}
            {formatDate(rezultat.incasare.data)} a dispărut de la{' '}
            <strong>{rezultat.sursa.client_nume}</strong> și a apărut la{' '}
            <strong>{rezultat.tinta.client_nume}</strong>.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ParteCard titlu="De la" parte={rezultat.sursa} dupa />
            <ParteCard titlu="La" parte={rezultat.tinta} dupa />
          </div>
          <Avertismente lista={rezultat.avertismente} />
        </div>
      </Modal>
    )
  }

  const verificare = verificareQ.data
  const eroareVerificare = verificareQ.isError
    ? humanizeError(verificareQ.error, 'Mutarea nu e posibilă.')
    : null
  const colegi = colegiQ.data ?? []
  const rezultateCautare = search.results.filter((c) => c.id !== clientId)

  return (
    <Modal
      open={open}
      title="Mută plata la alt client"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !verificare ||
              verificareQ.isError ||
              verificareQ.isFetching ||
              muta.isPending ||
              !motiv.trim()
            }
          >
            {muta.isPending ? 'Se mută…' : 'Mută plata'}
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        <p className="text-quasar-gray">
          Pentru o plată înregistrată din greșeală la <strong className="text-ink">{clientNume}</strong>.
          Plata dispare de aici și apare la clientul corect, cu aceeași sumă, dată și formă de plată.
        </p>

        <section className="space-y-2">
          <h4 className="font-semibold text-ink">1. Plata greșită</h4>
          <p className="text-xs text-quasar-gray">
            {clientNume} · {luna.nume_curs} · {formatMonth(luna.data_incepere)}
          </p>
          {incasariQ.isLoading ? (
            <Spinner />
          ) : (incasariQ.data ?? []).length === 0 ? (
            <p className="text-quasar-gray">Nu există plăți pe luna asta.</p>
          ) : (
            <ul className="space-y-1.5">
              {(incasariQ.data ?? []).map((i) => {
                const restituire = i.suma <= 0
                const ales = incasareId === i.id
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      disabled={restituire}
                      onClick={() => {
                        setIncasareId(i.id)
                        setError(null)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                        ales ? 'border-quasar-yellow bg-quasar-yellow/10' : 'border-line hover:bg-surface',
                        restituire && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                      )}
                    >
                      <span className="text-quasar-gray">{formatDate(i.data)}</span>
                      <span className="font-semibold text-ink">{formatRON(i.suma)}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', metodaTone(i.metoda ?? ''))}>
                        {i.metoda ?? '—'}
                      </span>
                      <span className="flex-1 truncate text-right text-xs text-quasar-gray">
                        {restituire ? 'restituire — nu se mută' : (i.observatii ?? '')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="font-semibold text-ink">2. Clientul corect</h4>
          {tinta ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-quasar-yellow bg-quasar-yellow/10 px-3 py-2">
              <strong className="text-ink">{tinta.nume}</strong>
              <Button
                variant="ghost"
                onClick={() => {
                  setTinta(null)
                  setTintaEnrollmentId(null)
                }}
              >
                Schimbă
              </Button>
            </div>
          ) : (
            <>
              <TextInput
                placeholder="Caută după nume…"
                value={search.input}
                onChange={(e) => search.setInput(e.target.value)}
                autoFocus
              />
              {search.tooShort ? (
                colegiQ.isLoading ? (
                  <Spinner />
                ) : colegi.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-quasar-gray">
                      Colegi din {luna.nume_curs} cu restanță pe {formatMonth(luna.data_incepere)}:
                    </p>
                    <ul className="max-h-48 space-y-1 overflow-y-auto">
                      {colegi.map((c) => (
                        <li key={c.id_enrollment}>
                          <button
                            type="button"
                            onClick={() => alegeClient({ id: c.id_cursant, nume: c.nume_client })}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-left hover:bg-surface"
                          >
                            <span className="text-ink">{c.nume_client}</span>
                            <span className="text-xs text-red-700">rest {formatRON(c.rest)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-quasar-gray">Scrie cel puțin 2 litere din nume.</p>
                )
              ) : search.isFetching && rezultateCautare.length === 0 ? (
                <Spinner />
              ) : rezultateCautare.length === 0 ? (
                <p className="text-xs text-quasar-gray">Niciun client găsit.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {rezultateCautare.map((c) => {
                    const nume = `${c.nume ?? ''} ${c.prenume ?? ''}`.trim()
                    const varsta = calcAge(c.data_nasterii)
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => alegeClient({ id: c.id, nume })}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-left hover:bg-surface"
                        >
                          <span className="text-ink">{nume}</span>
                          <span className="text-xs text-quasar-gray">
                            {varsta !== null ? `${varsta} ani · ` : ''}
                            {c.status ?? ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        {tinta && (
          <section className="space-y-2">
            <h4 className="font-semibold text-ink">3. Luna pe care intră plata</h4>
            {luniQ.isLoading ? (
              <Spinner />
            ) : (luniQ.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                {tinta.nume} nu are nicio lună cu rest de plată. Înrolează-l întâi pe cursul
                corect, apoi mută plata.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {sortLuni(luniQ.data ?? [], luna).map((l) => (
                  <li key={l.id_enrollment}>
                    <button
                      type="button"
                      onClick={() => {
                        setTintaEnrollmentId(l.id_enrollment)
                        setError(null)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors',
                        tintaEnrollmentId === l.id_enrollment
                          ? 'border-quasar-yellow bg-quasar-yellow/10'
                          : 'border-line hover:bg-surface',
                      )}
                    >
                      <span className="text-ink">
                        {l.nume_curs ?? '—'} · {formatMonth(l.data_incepere)}
                      </span>
                      <span className="text-xs text-red-700">rest {formatRON(l.rest)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {incasareId && tintaEnrollmentId && (
          <section className="space-y-2">
            <h4 className="font-semibold text-ink">Ce se schimbă</h4>
            {verificareQ.isFetching && !verificare ? (
              <Spinner />
            ) : eroareVerificare ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                {eroareVerificare}
              </p>
            ) : verificare ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ParteCard titlu="Dispare de la" parte={verificare.sursa} />
                  <ParteCard titlu="Apare la" parte={verificare.tinta} />
                </div>
                <p className="text-xs text-quasar-gray">
                  Plata rămâne {formatRON(verificare.incasare.suma)}{' '}
                  {verificare.incasare.metoda ?? ''} din {formatDate(verificare.incasare.data)}
                  {verificare.incasare.locatie_nume ? `, ${verificare.incasare.locatie_nume}` : ''}.
                  Casa zilei nu se schimbă. Mutarea apare în jurnalul de audit.
                </p>
                <Avertismente lista={verificare.avertismente} />
              </>
            ) : null}
          </section>
        )}

        <Field label="Motiv (obligatoriu)" required htmlFor="muta-incasare-motiv">
          <TextArea
            id="muta-incasare-motiv"
            rows={2}
            value={motiv}
            onChange={(e) => setMotiv(e.target.value)}
            placeholder="Ex: încasat din greșeală la Olaru Alessia, banii sunt de la Ivan Alesia."
          />
        </Field>

        {error && error !== eroareVerificare && <p className="text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}

function sortLuni(luni: LunaCuRest[], luna: Props['luna']): LunaCuRest[] {
  const scor = (l: LunaCuRest) =>
    (l.id_curs === luna.id_curs ? 0 : 2) + (sameMonth(l.data_incepere, luna.data_incepere) ? 0 : 1)
  return [...luni].sort(
    (a, b) => scor(a) - scor(b) || a.data_incepere.localeCompare(b.data_incepere),
  )
}

function ParteCard({ titlu, parte, dupa = false }: { titlu: string; parte: MutareParte; dupa?: boolean }) {
  const restDupa = parte.total - parte.platit_dupa
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-quasar-gray">{titlu}</p>
      <p className="font-semibold text-ink">{parte.client_nume}</p>
      <p className="text-xs text-quasar-gray">
        {parte.curs ?? '—'} · {formatMonth(parte.data_incepere)}
      </p>
      <p className="mt-1">
        {dupa ? 'Plătit acum: ' : `Plătit ${formatRON(parte.platit_inainte)} → `}
        <strong>{formatRON(parte.platit_dupa)}</strong> din {formatRON(parte.total)}
      </p>
      <span
        className={cn(
          'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium',
          restDupa > 0.004 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
        )}
      >
        {restDupa > 0.004 ? `Restanță ${formatRON(restDupa)}` : 'Achitat'}
      </span>
    </div>
  )
}

function Avertismente({ lista }: { lista: string[] }) {
  if (lista.length === 0) return null
  return (
    <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
      {lista.map((a) => (
        <li key={a}>⚠️ {a}</li>
      ))}
    </ul>
  )
}
