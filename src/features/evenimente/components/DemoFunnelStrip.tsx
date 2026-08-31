import { useQuery } from '@tanstack/react-query'
import { getDemoFunnel } from '../apiDemo'

function Cell({
  label,
  value,
  base,
}: {
  label: string
  value: number
  base?: number
}) {
  const pct = base && base > 0 ? Math.round((value / base) * 100) : null
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wide text-quasar-gray">
        {label}
      </span>
      <span className="text-lg font-bold text-quasar-black">
        {value}
        {pct != null && (
          <span className="ml-1 text-xs font-medium text-quasar-gray">
            {pct}%
          </span>
        )}
      </span>
    </div>
  )
}

// Rezultatul demoului, pe slotul curent. Procentele se raportează la înscriși —
// „câți din cei programați au ajuns până la contract".
export function DemoFunnelStrip({
  evenimentId,
  data,
}: {
  evenimentId: string
  data: string | null
}) {
  const q = useQuery({
    queryKey: ['demo-funnel', evenimentId, data],
    queryFn: () => getDemoFunnel({ from: data!, to: data! }),
    enabled: Boolean(data),
  })
  const row = (q.data ?? []).find((r) => r.eveniment_id === evenimentId)
  if (!row) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-6 rounded-md border border-quasar-gray-light bg-white px-4 py-3">
      <Cell label="Înscriși" value={row.inscrisi} />
      <Cell label="Prezenți" value={row.prezenti} base={row.inscrisi} />
      <Cell label="Absenți" value={row.absenti} base={row.inscrisi} />
      <Cell label="Convertiți" value={row.convertiti} base={row.inscrisi} />
      {row.curs_tinta_nume && (
        <Cell
          label={`Pe ${row.curs_tinta_nume}`}
          value={row.inscrisi_pe_grupa_tinta}
          base={row.inscrisi}
        />
      )}
      <Cell
        label="Contract semnat"
        value={row.contract_semnat}
        base={row.inscrisi}
      />
    </div>
  )
}
