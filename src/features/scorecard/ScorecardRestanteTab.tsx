import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Field, Select, Button, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { locatiiOptions } from '@/lib/lookups'
import { listUsers } from '@/features/setari/utilizatoriApi'
import { getScorecardRestante, getRataRestante, listPraguri } from './api'
import { ScorecardRestanteTable } from './ScorecardRestanteTable'
import { DATA_LANSARE_SCORECARD } from './constants'

const LANSARE_LUNA = DATA_LANSARE_SCORECARD.slice(0, 7)

export function ScorecardRestanteTab({ luna }: { luna: string }) {
  const [locatieId, setLocatieId] = useState('')

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })
  const rataQ = useQuery({
    queryKey: ['rata-restante', luna, locatieId],
    queryFn: () => getRataRestante(luna, locatieId || null),
    placeholderData: keepPreviousData,
  })
  const praguriQ = useQuery({
    queryKey: ['scorecard-praguri'],
    queryFn: listPraguri,
  })
  const scorecardQ = useQuery({
    queryKey: ['scorecard', 'restante', luna, locatieId],
    queryFn: () => getScorecardRestante(luna, locatieId || null),
    placeholderData: keepPreviousData,
  })
  const usersQ = useQuery({
    queryKey: ['lookup', 'users'],
    queryFn: listUsers,
    retry: false,
  })

  const pragRestante = Number(
    praguriQ.data?.find((p) => p.cheie === 'rata_restante')?.prag_standard ?? 7,
  )

  const usersById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of usersQ.data ?? []) m.set(u.id, u.email ?? u.id)
    return m
  }, [usersQ.data])

  const rows = scorecardQ.data ?? []
  const inainteDeLansare = luna < LANSARE_LUNA

  const onExport = () => {
    const headers = [
      'Operator', 'Contacte recuperare', 'Clienți contactați',
      'Recuperat (verif.) RON', 'Rest rămas RON', 'Rată recuperare %',
      'Igienă %', 'Scor %', 'Clasă',
    ]
    const body = rows.map((r) => [
      usersById.get(r.user_id) ?? r.user_id,
      r.contacte_recuperare, r.clienti_contactati, r.suma_recuperata,
      r.rest_ramas, r.rata_recuperare_pct ?? '', r.igiena_pct ?? '',
      r.scor_pct ?? '', r.clasa_generala ?? '',
    ])
    downloadCsv(`scorecard-restante-${luna}.csv`, headers, body)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Locație" htmlFor="sc-loc-rest">
            <Select
              id="sc-loc-rest"
              placeholder="Toate locațiile"
              options={locatiiQ.data ?? []}
              value={locatieId}
              onChange={(e) => setLocatieId(e.target.value)}
            />
          </Field>
        </div>
        <div className="ml-auto">
          <Button variant="secondary" onClick={onExport} disabled={rows.length === 0}>
            ⬇ Export CSV
          </Button>
        </div>
      </div>

      {rataQ.data && rataQ.data.rata_pct != null && (
        <div
          className={`mb-3 rounded-lg border px-4 py-3 ${
            rataQ.data.rata_pct <= pragRestante
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-quasar-black">
              Rată restanțe {luna} (țintă echipă ≤ {pragRestante}%)
            </span>
            <span
              className={`text-2xl font-bold ${
                rataQ.data.rata_pct <= pragRestante
                  ? 'text-emerald-700'
                  : 'text-red-700'
              }`}
            >
              {rataQ.data.rata_pct}%
            </span>
          </div>
          <p className="mt-0.5 text-xs text-quasar-gray">
            Rest {formatRON(rataQ.data.rest)} din{' '}
            {formatRON(rataQ.data.de_incasat)} de încasat · abonamente + one-off,
            aceeași bază ca pe /datorii
          </p>
        </div>
      )}

      <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <strong>Recuperare verificată:</strong> „Recuperat" e suma încasărilor
        REALE (din plăți) după data contactului — nu o valoare declarată de
        operator, deci nu se poate falsifica. „Rată recuperare" = recuperat /
        (recuperat + rest rămas) pe clienții lucrați.
        {inainteDeLansare && (
          <span className="font-medium">
            {' '}Atenție: logul de recuperare începe din {LANSARE_LUNA}.
          </span>
        )}
      </div>

      {scorecardQ.isLoading ? (
        <Spinner />
      ) : scorecardQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare:{' '}
          {humanizeError(scorecardQ.error)}
        </p>
      ) : (
        <ScorecardRestanteTable rows={rows} usersById={usersById} />
      )}
    </div>
  )
}
