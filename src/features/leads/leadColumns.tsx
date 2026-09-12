import type { Lead } from '@/types/db'
import type { Column } from '@/components/ui'
import { formatDate } from '@/lib/format'
import { waLink } from '@/lib/phone'
import { StatusBadge, SubStatusBadge, SursaBadge, ExClientBadge } from './Badges'
import {
  DAY_MS,
  esteExClient,
  FOLLOWUP_DAYS,
  INACTIVE_DAYS,
  isToday,
  waLeadMessage,
} from './constants'
import { timpRelativ } from './LeadHistory'

export type LeadColumnKey =
  | 'nume' | 'telefon' | 'locatie' | 'status' | 'ultimContact'
  | 'prezenta' | 'interes' | 'observatii' | 'sursa' | 'adaugat' | 'actiuni'

export type UltimContactTone = 'niciodata' | 'inactiv' | 'atentie' | 'recent'

export type UltimContactMeta = {
  // 0 = niciodată contactat. Deliberat NUMĂR, nu null: DataTable.compareValues
  // trimite valorile goale la coadă indiferent de direcție, deci un null ar
  // îngropa exact rândurile cele mai urgente la finalul tabelului.
  // Folosit de etichetă și de filtrul „Niciodată contactat" — NU de sortare.
  ts: number
  // Cheia de ordonare: ultimul contact sau, dacă nu există, data intrării.
  // `ts` singur nu departajează necontactații (toți 0), iar ei sunt majoritatea
  // — lista ar părea neordonată, cu cel mai vechi lead la coada blocului.
  // Aceeași definiție ca „ultima activitate" din TodayPanel, ca vederile să nu
  // spună două adevăruri despre același lead.
  activityTs: number
  label: string
  // Pentru necontactați: de când așteaptă. Face ordinea lizibilă în celulă.
  intrat: string | null
  tone: UltimContactTone
  nr: number
}

const TONE_CLS: Record<UltimContactTone, string> = {
  niciodata: 'text-red-600 font-medium',
  inactiv: 'text-slate-500',
  atentie: 'text-amber-600',
  recent: 'text-quasar-gray',
}

export function numeLead(l: Lead): string {
  const persoana = [l.prenume, l.nume].filter(Boolean).join(' ').trim()
  return persoana || l.nume_parinte || '(fără nume)'
}

export function ultimContactMeta(l: Lead, now = Date.now()): UltimContactMeta {
  const nr = l.nr_contactari ?? 0
  if (!l.ultima_contactare_la) {
    return {
      ts: 0,
      activityTs: new Date(l.created).getTime(),
      label: 'Niciodată',
      intrat: timpRelativ(l.created),
      tone: 'niciodata',
      nr,
    }
  }
  const ts = new Date(l.ultima_contactare_la).getTime()
  const zile = (now - ts) / DAY_MS
  const tone: UltimContactTone =
    zile > INACTIVE_DAYS ? 'inactiv' : zile > FOLLOWUP_DAYS ? 'atentie' : 'recent'
  return {
    ts,
    activityTs: ts,
    label: timpRelativ(l.ultima_contactare_la),
    intrat: null,
    tone,
    nr,
  }
}

export type PrezentaLead = { rang: number; label: string; cls: string }

// „A venit / nu a venit" la demo. În Nurture `status` s-a pierdut (toate sunt
// `nurture`), deci `prezentaByLead` — ultima prezență din programari_leads — e
// singura sursă. `nr_neprezentari` completează cu de câte ori a lipsit.
export function prezentaLead(
  l: Lead,
  prezentaByLead?: Map<string, string>,
): PrezentaLead {
  const p = prezentaByLead?.get(l.id)
  const venit = l.status === 'a_venit' || p === 'prezent'
  const absent = l.status === 'nu_a_venit' || p === 'absent'
  const nep = l.nr_neprezentari ?? 0
  if (venit) return { rang: 3, label: 'A venit', cls: 'text-emerald-600' }
  if (absent) {
    return {
      rang: 1,
      label: nep > 1 ? `Nu a venit (${nep}×)` : 'Nu a venit',
      cls: 'text-red-600',
    }
  }
  if (l.status === 'programat' || p === 'programat') {
    return { rang: 2, label: 'Programat', cls: 'text-amber-600' }
  }
  return { rang: 0, label: '—', cls: 'text-quasar-gray' }
}

// `observatii` e un jurnal invers-cronologic (prependObservatie scrie în față),
// deci prima linie e cea mai recentă notă.
export function ultimaObservatie(l: Lead): string | null {
  const t = l.observatii?.trim()
  if (!t) return null
  return t.split('\n')[0]?.trim() || null
}

export function buildLeadColumns(opts: {
  keys: readonly LeadColumnKey[]
  campaniiById: Map<string, string>
  prezentaByLead?: Map<string, string>
  onLogContact?: (lead: Lead) => void
  now?: number
}): Column<Lead>[] {
  const { keys, campaniiById, prezentaByLead, onLogContact, now } = opts

  const defs: Record<LeadColumnKey, Column<Lead>> = {
    nume: {
      header: 'Nume',
      cell: (l) => (
        <span className="flex items-center gap-1.5">
          {l.flag_reminder && <span title="Marcat pentru revenire">⚑</span>}
          <span className="truncate font-medium" title={numeLead(l)}>
            {numeLead(l)}
          </span>
          {l.deja_client && <span title="Deja client">🔁</span>}
          {esteExClient(l) && <ExClientBadge />}
        </span>
      ),
      sortValue: (l) => numeLead(l),
      className: 'max-w-[16rem]',
    },
    telefon: {
      header: 'Telefon',
      cell: (l) => {
        if (!l.telefon) return '—'
        const wa = waLink(l.telefon, waLeadMessage(l))
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <a
              href={`tel:${l.telefon}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
            >
              {l.telefon}
            </a>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="WhatsApp"
              >
                💬
              </a>
            )}
          </span>
        )
      },
      sortValue: (l) => l.telefon,
    },
    locatie: {
      header: 'Locație',
      cell: (l) => l.locatia ?? '—',
      sortValue: (l) => l.locatia,
      className: 'whitespace-nowrap',
    },
    status: {
      header: 'Status',
      cell: (l) => (
        <span className="flex items-center gap-1">
          <StatusBadge status={l.status} />
          <SubStatusBadge subStatus={l.sub_status} />
        </span>
      ),
      sortValue: (l) => l.status,
      className: 'whitespace-nowrap',
    },
    ultimContact: {
      header: 'Ultim contact',
      cell: (l) => {
        const m = ultimContactMeta(l, now)
        return (
          <span className="whitespace-nowrap">
            <span className={TONE_CLS[m.tone]}>{m.label}</span>
            {m.intrat && (
              <span className="ml-1 text-xs text-quasar-gray">
                · intrat {m.intrat}
              </span>
            )}
            {m.nr > 0 && (
              <span className="ml-1 text-xs text-quasar-gray">· {m.nr}×</span>
            )}
          </span>
        )
      },
      sortValue: (l) => ultimContactMeta(l, now).activityTs,
    },
    prezenta: {
      header: 'Demo',
      cell: (l) => {
        const p = prezentaLead(l, prezentaByLead)
        return <span className={p.cls}>{p.label}</span>
      },
      sortValue: (l) => prezentaLead(l, prezentaByLead).rang,
      className: 'whitespace-nowrap',
    },
    // Text compact, nu badge-uri: două badge-uri într-o coloană îngustă se rup
    // pe 2-3 linii și dublează înălțimea fiecărui rând din tabel.
    interes: {
      header: 'Interes / Grupă',
      cell: (l) => {
        const t = [l.interes, l.grupa_varsta].filter(Boolean).join(' · ')
        return t ? (
          <span className="text-quasar-gray" title={t}>
            {t}
          </span>
        ) : (
          <span className="text-quasar-gray">—</span>
        )
      },
      sortValue: (l) => l.interes,
      className: 'whitespace-nowrap',
    },
    observatii: {
      header: 'Notiță',
      cell: (l) => {
        const nota = ultimaObservatie(l)
        if (!nota) return <span className="text-quasar-gray">—</span>
        return (
          <span
            title={l.observatii ?? undefined}
            className="block max-w-[18rem] truncate text-quasar-gray"
          >
            {nota}
          </span>
        )
      },
      sortValue: (l) => ultimaObservatie(l),
    },
    sursa: {
      header: 'Sursă',
      cell: (l) => (
        <SursaBadge sursa={l.sursa ? (campaniiById.get(l.sursa) ?? null) : null} />
      ),
      sortValue: (l) => (l.sursa ? (campaniiById.get(l.sursa) ?? '') : ''),
    },
    adaugat: {
      header: 'Adăugat',
      cell: (l) => (
        <span className="whitespace-nowrap">
          {formatDate(l.created)}
          {isToday(l.created) && (
            <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              Azi
            </span>
          )}
        </span>
      ),
      sortValue: (l) => new Date(l.created).getTime(),
      // Data intrării se citește invers: cele mai noi primele, de la primul click.
      defaultDir: 'desc',
      className: 'whitespace-nowrap',
    },
    actiuni: {
      header: '',
      cell: (l) =>
        onLogContact ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onLogContact(l)
            }}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-quasar-yellow hover:bg-quasar-yellow"
            title="Loghează contact"
          >
            📞 Loghează
          </button>
        ) : null,
      className: 'whitespace-nowrap',
    },
  }

  return keys.map((k) => defs[k])
}
