import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Field, Select, Button, Spinner } from '@/components/ui'
import { downloadCsv } from '@/lib/csv'
import { listUsers } from '@/features/setari/utilizatoriApi'
import { getScorecard } from './api'
import { ObiectiveCard } from './ObiectiveCard'
import { ScorecardTable } from './ScorecardTable'
import { DATA_LANSARE_SCORECARD, LOCATII_SCORECARD } from './constants'

const LANSARE_LUNA = DATA_LANSARE_SCORECARD.slice(0, 7)

export function ScorecardLeadsTab({ luna }: { luna: string }) {
  const [locatie, setLocatie] = useState('')

  const scorecardQ = useQuery({
    queryKey: ['scorecard', 'leads', luna, locatie],
    queryFn: () => getScorecard(luna, locatie || null),
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
      'Operator', 'Contacte verificate', 'Contacte total', 'Logate', 'Deduse', 'Telefon', 'SMS',
      'Email', 'DM', 'Leaduri lucrate', 'Viteză (h)', 'Persistență', 'Igienă %',
      'Follow-up %', 'Conversie %', 'Show-rate %', 'Scor %', 'Clasă',
    ]
    const body = rows.map((r) => [
      usersById.get(r.user_id) ?? r.user_id,
      r.contacte_verificate, r.contacte_total, r.contacte_logate, r.contacte_deduse,
      r.contacte_telefon, r.contacte_sms,
      r.contacte_email, r.contacte_dm, r.leaduri_lucrate, r.viteza_med_ore ?? '',
      r.persistenta_med ?? '', r.igiena_crm_pct ?? '', r.followup_onorat_pct ?? '',
      r.conversie_pct ?? '', r.show_rate_pct ?? '', r.scor_pct ?? '',
      r.clasa_generala ?? '',
    ])
    downloadCsv(`scorecard-leads-${luna}${locatie ? `-${locatie}` : ''}.csv`, headers, body)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Locație" htmlFor="sc-loc-leads">
            <Select
              id="sc-loc-leads"
              placeholder="Toate locațiile"
              options={LOCATII_SCORECARD.map((l) => ({ label: l, value: l }))}
              value={locatie}
              onChange={(e) => setLocatie(e.target.value)}
            />
          </Field>
        </div>
        <div className="ml-auto">
          <Button variant="secondary" onClick={onExport} disabled={rows.length === 0}>
            ⬇ Export CSV
          </Button>
        </div>
      </div>

      <ObiectiveCard luna={luna} locatie={locatie || null} rows={rows} />

      <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <strong>Logat vs verificat:</strong> „Contacte verificate" numără doar
        contactele de pe lead-uri cu o urmă externă (SMS prin gateway, prezență
        la demo sau conversie) — pe care operatorul nu le poate fabrica. Baza
        fixă din salariu se evaluează pe coloana verificată, nu pe click-uri.
        <br />
        <strong>Logate vs deduse:</strong> din 18 septembrie 2026, mutarea unui
        card într-un status care presupune o discuție se numără singură ca
        și contact. Totalul arată deci munca reală; în paranteză vezi câte au
        fost logate explicit cu butonul 📞 — igiena notelor se măsoară doar pe
        acelea.
        {inainteDeLansare && (
          <span className="font-medium">
            {' '}Atenție: logul de contacte începe din {LANSARE_LUNA}. Pentru
            luna selectată, volumul/viteza/persistența apar ca „—"; rămân valide
            doar conversia și show-rate-ul.
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
        <ScorecardTable rows={rows} usersById={usersById} />
      )}
    </div>
  )
}
