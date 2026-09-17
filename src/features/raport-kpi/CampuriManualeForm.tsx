import { Button, Checkbox, Field, TextInput } from '@/components/ui'
import type { CampManual, RaportKpi, ValoriManuale } from './types'

type Intrare = {
  kpiId: string
  cheie: string
  denumire: string
  campuri: CampManual[]
  /** KPI fără câmpuri proprii: o singură valoare, sub cheia `valoare`. */
  simplu: 'bifa' | 'numar' | null
}

/**
 * Ce trebuie completat de om se DEDUCE din configurație, nu se scrie în cod:
 * indicatorii manuali din grilă plus cei automați care au câmpuri proprii
 * („răspuns sub 24h" — cifrele vin din Meta, nu din baza noastră).
 */
function intrari(raport: RaportKpi, campuri: CampManual[]): Intrare[] {
  const dupaKpi = new Map<string, CampManual[]>()
  for (const c of campuri) {
    const l = dupaKpi.get(c.kpi_id) ?? []
    l.push(c)
    dupaKpi.set(c.kpi_id, l)
  }

  const toate = [
    ...raport.linii.filter((l) => l.aplicabil).map((l) => ({
      kpi_id: l.kpi_id, cheie: l.cheie, denumire: l.denumire,
      sursa: l.sursa, bifa: l.tip_prag === 'afirmativ',
    })),
    ...raport.eliminatorii.filter((e) => e.aplicabil).map((e) => ({
      kpi_id: e.kpi_id, cheie: e.cheie, denumire: e.denumire,
      sursa: e.sursa, bifa: true,
    })),
  ]

  return toate
    .map<Intrare | null>((x) => {
      const proprii = dupaKpi.get(x.kpi_id) ?? []
      if (proprii.length > 0) {
        return { kpiId: x.kpi_id, cheie: x.cheie, denumire: x.denumire, campuri: proprii, simplu: null }
      }
      if (x.sursa !== 'manual') return null
      return {
        kpiId: x.kpi_id, cheie: x.cheie, denumire: x.denumire, campuri: [],
        simplu: x.bifa ? 'bifa' : 'numar',
      }
    })
    .filter((x): x is Intrare => x !== null)
}

type Props = {
  raport: RaportKpi
  campuri: CampManual[]
  valori: ValoriManuale
  zile: { lucrate: string; baza: string }
  readOnly: boolean
  salvand: boolean
  modificat: boolean
  onChange: (cheieKpi: string, cheieCamp: string, v: number | boolean | null) => void
  onZile: (care: 'lucrate' | 'baza', v: string) => void
  onSave: () => void
}

export function CampuriManualeForm({
  raport, campuri, valori, zile, readOnly, salvand, modificat, onChange, onZile, onSave,
}: Props) {
  const lista = intrari(raport, campuri)
  const sug = raport.zile.sugestie

  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Ce completezi tu</h3>
        {!readOnly && (
          <Button onClick={onSave} disabled={salvand || !modificat}>
            {salvand ? 'Se salvează…' : modificat ? 'Salvează și recalculează' : 'Salvat'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {lista.map((i) => (
          <div key={i.kpiId} className="rounded-lg border border-line p-3">
            <div className="mb-2 text-sm font-medium text-ink">{i.denumire}</div>

            {i.simplu === 'bifa' && (
              <Checkbox
                id={`m-${i.cheie}`}
                disabled={readOnly}
                checked={valori[i.cheie]?.valoare === true}
                onChange={(e) => onChange(i.cheie, 'valoare', e.target.checked)}
                label="Îndeplinit luna asta"
              />
            )}

            {i.simplu === 'numar' && (
              <TextInput
                type="number"
                step="1"
                disabled={readOnly}
                value={String(valori[i.cheie]?.valoare ?? '')}
                onChange={(e) =>
                  onChange(i.cheie, 'valoare', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            )}

            {i.campuri.length > 0 && (
              <div className="space-y-3">
                {i.campuri.map((c) =>
                  c.tip === 'bifa' ? (
                    <Checkbox
                      key={c.id}
                      id={`m-${i.cheie}-${c.cheie}`}
                      disabled={readOnly}
                      checked={valori[i.cheie]?.[c.cheie] === true}
                      onChange={(e) => onChange(i.cheie, c.cheie, e.target.checked)}
                      label={c.eticheta}
                    />
                  ) : (
                    <Field key={c.id} label={c.eticheta} htmlFor={`m-${i.cheie}-${c.cheie}`}>
                      <TextInput
                        id={`m-${i.cheie}-${c.cheie}`}
                        type="number"
                        step="0.1"
                        disabled={readOnly}
                        value={String(valori[i.cheie]?.[c.cheie] ?? '')}
                        onChange={(e) =>
                          onChange(
                            i.cheie,
                            c.cheie,
                            e.target.value === '' ? null : Number(e.target.value),
                          )
                        }
                      />
                      {c.unitate && <p className="mt-1 text-xs text-muted">{c.unitate}</p>}
                    </Field>
                  ),
                )}
              </div>
            )}
          </div>
        ))}

        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-sm font-medium text-ink">Zile lucrate (pro-rata)</div>
          <p className="mb-2 text-xs text-muted">
            Lasă gol ca luna să se plătească întreagă. Sub {raport.zile.prag} zile lucrate, luna nu
            se bonifică deloc.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Lucrate" htmlFor="zile-lucrate">
              <TextInput
                id="zile-lucrate"
                type="number"
                step="1"
                disabled={readOnly}
                value={zile.lucrate}
                onChange={(e) => onZile('lucrate', e.target.value)}
              />
            </Field>
            <Field label="Zile cu program" htmlFor="zile-baza">
              <TextInput
                id="zile-baza"
                type="number"
                step="1"
                disabled={readOnly}
                value={zile.baza}
                onChange={(e) => onZile('baza', e.target.value)}
              />
            </Field>
          </div>
          {(sug.lucrate ?? 0) > 0 && (
            <p className="mt-2 text-xs text-muted">
              Din pontaj: {sug.lucrate} zile lucrate din {sug.baza} cu program.
              {!readOnly && (
                <button
                  type="button"
                  className="ml-2 underline underline-offset-2"
                  onClick={() => {
                    onZile('lucrate', String(sug.lucrate ?? ''))
                    onZile('baza', String(sug.baza ?? ''))
                  }}
                >
                  Preia
                </button>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
