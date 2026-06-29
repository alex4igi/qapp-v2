import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Field, Select, Button, Spinner } from '@/components/ui'
import { downloadCsv } from '@/lib/csv'
import { locatiiOptions } from '@/lib/lookups'
import { listUsers } from '@/features/setari/utilizatoriApi'
import { getScorecardReactivari } from './api'
import { ScorecardReactivariTable } from './ScorecardReactivariTable'
import { DATA_LANSARE_SCORECARD } from './constants'

const LANSARE_LUNA = DATA_LANSARE_SCORECARD.slice(0, 7)

export function ScorecardReactivariTab({ luna }: { luna: string }) {
  const [locatieId, setLocatieId] = useState('')

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })
  const scorecardQ = useQuery({
    queryKey: ['scorecard', 'reactivari', luna, locatieId],
    queryFn: () => getScorecardReactivari(luna, locatieId || null),
    placeholderData: keepPreviousData,
  })
  const usersQ = useQuery({
    queryKey: ['lookup', 'users'],
    queryFn: listUsers,
    retry: false,
  })

  const usersById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of usersQ.data ?? []) m.set(u.id, u.email ?? u.id)
    return m
  }, [usersQ.data])

  const rows = scorecardQ.data ?? []
  const inainteDeLansare = luna < LANSARE_LUNA

  const onExport = () => {
    const headers = [
      'Operator', 'Contacte reactivare', 'Clienți contactați',
      'Reactivați (verif.)', 'Rată reactivare %', 'Igienă %', 'Scor %', 'Clasă',
    ]
    const body = rows.map((r) => [
      usersById.get(r.user_id) ?? r.user_id,
      r.contacte_reactivare, r.clienti_contactati, r.reactivati,
      r.rata_reactivare_pct ?? '', r.igiena_pct ?? '', r.scor_pct ?? '',
      r.clasa_generala ?? '',
    ])
    downloadCsv(`scorecard-reactivari-${luna}.csv`, headers, body)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Locație" htmlFor="sc-loc-react">
            <Select
              id="sc-loc-react"
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

      <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <strong>Reactivare verificată:</strong> „Reactivat" înseamnă că un client
        inactiv contactat a avut o prezență reală la cursuri DUPĂ contact — nu
        ce a promis la telefon. Rata = reveniri / clienți lucrați.
        {inainteDeLansare && (
          <span className="font-medium">
            {' '}Atenție: logul de reactivare începe din {LANSARE_LUNA}.
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
        <ScorecardReactivariTable rows={rows} usersById={usersById} />
      )}
    </div>
  )
}
