import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LeadFunnel } from './api'

type Props = {
  data: LeadFunnel
  emptyMessage?: string
}

const STAGE_COLORS = [
  '#ffd600', // Lead
  '#fbbf24', // Contact
  '#f59e0b', // Probă
  '#10b981', // Prezent
  '#059669', // Înscriere
  '#1d4ed8', // Retenție 90z
]

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((100 * num) / den) : 0
}

export function FunnelLeadsChart({
  data,
  emptyMessage = 'Niciun lead în intervalul ales.',
}: Props) {
  const g = data.global
  const hasData = g.leads > 0

  // Treptele funnel-ului. Retenția se raportează la baza eligibilă (convertiți
  // maturi ≥90z), nu la toți convertiții — altfel pare fals de mică.
  const stages = [
    { label: 'Lead', value: g.leads, dinTop: 100, dinPrev: 100 },
    {
      label: 'Contact',
      value: g.contactati,
      dinTop: pct(g.contactati, g.leads),
      dinPrev: pct(g.contactati, g.leads),
    },
    {
      label: 'Probă',
      value: g.proba,
      dinTop: pct(g.proba, g.leads),
      dinPrev: pct(g.proba, g.contactati),
    },
    {
      label: 'Prezent la probă',
      value: g.prezenti,
      dinTop: pct(g.prezenti, g.leads),
      dinPrev: pct(g.prezenti, g.proba),
    },
    {
      label: 'Înscriere',
      value: g.convertiti,
      dinTop: pct(g.convertiti, g.leads),
      dinPrev: pct(g.convertiti, g.prezenti),
    },
    {
      label: 'Retenție 90z',
      value: g.retentie90z,
      dinTop: pct(g.retentie90z, g.leads),
      dinPrev: pct(g.retentie90z, g.retentieEligibili),
    },
  ]

  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-quasar-black">
          Funnel leads
        </h3>
        <span className="text-xs text-quasar-gray">
          Lead → Contact → Probă → Prezent → Înscriere → Retenție 90z
        </span>
      </div>

      {!hasData ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          {emptyMessage}
        </p>
      ) : (
        <>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={stages}
                margin={{ top: 8, right: 56, left: 8, bottom: 8 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: '#f3f3f3' }}
                  formatter={(v, _n, item) => {
                    const p = (item?.payload as (typeof stages)[number])?.dinPrev
                    return [`${v} (${p}% din treapta anterioară)`, 'Leads']
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {stages.map((s, idx) => (
                    <Cell key={s.label} fill={STAGE_COLORS[idx]} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    style={{ fontSize: 12, fontWeight: 600, fill: '#111' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Rezumat trepte cu rata de trecere */}
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-quasar-gray-light pt-3 text-xs sm:grid-cols-3">
            {stages.map((s) => (
              <li key={s.label} className="flex justify-between gap-2">
                <span className="text-quasar-gray">{s.label}</span>
                <span className="font-medium text-quasar-black">
                  {s.value}{' '}
                  <span className="font-normal text-quasar-gray">
                    ({s.dinTop}%)
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {g.convertiti > g.retentieEligibili && (
            <p className="mt-2 text-xs text-quasar-gray">
              Retenția 90z se calculează pe {g.retentieEligibili} convertiți
              „maturi" (înscriși acum ≥90 zile);{' '}
              {g.convertiti - g.retentieEligibili} convertiți recenți încă nu pot
              fi evaluați.
            </p>
          )}

          {/* Defalcare pe sursă */}
          {data.perSursa.length > 1 && (
            <div className="mt-4 overflow-x-auto border-t border-quasar-gray-light pt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-quasar-gray">
                    <th className="py-1 pr-3 font-medium">Sursă</th>
                    <th className="py-1 px-2 text-right font-medium">Leads</th>
                    <th className="py-1 px-2 text-right font-medium">Înscriere</th>
                    <th className="py-1 px-2 text-right font-medium">Conv. %</th>
                    <th className="py-1 px-2 text-right font-medium">Ret. 90z</th>
                    <th className="py-1 pl-2 text-right font-medium">Ret. %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perSursa.map((r) => (
                    <tr
                      key={r.sursaId ?? r.sursaNume}
                      className="border-t border-quasar-gray-light/60"
                    >
                      <td className="py-1 pr-3 text-quasar-black">{r.sursaNume}</td>
                      <td className="py-1 px-2 text-right">{r.leads}</td>
                      <td className="py-1 px-2 text-right">{r.convertiti}</td>
                      <td className="py-1 px-2 text-right font-medium text-quasar-black">
                        {pct(r.convertiti, r.leads)}%
                      </td>
                      <td className="py-1 px-2 text-right">{r.retentie90z}</td>
                      <td className="py-1 pl-2 text-right font-medium text-quasar-black">
                        {r.retentieEligibili > 0
                          ? `${pct(r.retentie90z, r.retentieEligibili)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
