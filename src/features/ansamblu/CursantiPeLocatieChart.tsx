import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { ClientiActiviRow, ClientiInscrisiRow } from './api'

const COLORS = ['#FFD600', '#111827', '#9ca3af', '#3b82f6', '#10b981', '#a855f7']

type Props = {
  inscrisi: ClientiInscrisiRow[]
  inscrisiTotal: number
  activi: ClientiActiviRow[]
  activiTotal: number
}

// Două cifre, nu una: rosterul sezonului (donut) și cine chiar vine (blocul de
// jos). Lipite cu SAU într-un singur număr, cele două întrebări se anulau —
// între sezoane cifra trăia doar din coada de prezențe a sezonului încheiat.
export function CursantiPeLocatieChart({
  inscrisi,
  inscrisiTotal,
  activi,
  activiTotal,
}: Props) {
  const activiPerLocatie = new Map(activi.map((r) => [r.locatie_id, r.activi]))
  // Uniunea celor două liste: o locație care are prezențe dar niciun curs în
  // sezonul activ (sau invers) trebuie tot să apară, cu 0 pe coloana lipsă.
  // Aceeași ordine în inel și în lista de dedesubt (RPC-ul le dă pe uuid, ceea
  // ce arată aleatoriu), cea mai mare locație prima.
  const locatii = [
    ...inscrisi.map((r) => ({
      id: r.locatie_id,
      nume: r.locatie_nume,
      inscrisi: r.inscrisi,
    })),
    ...activi
      .filter((a) => !inscrisi.some((i) => i.locatie_id === a.locatie_id))
      .map((a) => ({ id: a.locatie_id, nume: a.locatie_nume, inscrisi: 0 })),
  ].sort(
    (a, b) => b.inscrisi - a.inscrisi || a.nume.localeCompare(b.nume, 'ro'),
  )

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">
        Cursanți pe locație
      </h3>
      {locatii.length === 0 ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          Nicio locație cu cursuri în sezonul activ.
        </p>
      ) : (
        <>
          <div className="relative h-72">
            {/* Total unic în centrul donut-ului (overlay HTML — centrare robustă).
                Donut-ul lasă un gol între ~38% și ~62% pe înălțime; -mt-6 compensează
                spațiul legendei de jos ca textul să cadă pe centrul inelului. */}
            <div className="pointer-events-none absolute inset-0 -mt-6 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-bold text-quasar-black">
                {inscrisiTotal}
              </span>
              <span className="text-xs text-quasar-gray">înscriși în sezon</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={locatii}
                  dataKey="inscrisi"
                  nameKey="nume"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={104}
                  paddingAngle={2}
                  label={({ value }) => `${value}`}
                  labelLine={false}
                >
                  {locatii.map((l, i) => (
                    <Cell key={l.id} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, n) => [`${v} înscriși`, n as string]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Ambele cifre, una lângă alta: pe donut se citește doar rosterul, iar
              „vin efectiv" e cifra care spune dacă rosterul chiar se prezintă. */}
          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="grid grid-cols-[1fr_5rem_5rem] gap-x-3 text-[11px] font-semibold uppercase tracking-wide text-quasar-gray">
              <span>Locație</span>
              <span className="text-right">Înscriși</span>
              <span className="text-right">Vin efectiv</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {locatii.map((l) => (
                <li
                  key={l.id}
                  className="grid grid-cols-[1fr_5rem_5rem] gap-x-3"
                >
                  <span className="truncate text-quasar-gray">{l.nume}</span>
                  <span className="fnum text-right font-medium text-quasar-black">
                    {l.inscrisi}
                  </span>
                  <span className="fnum text-right font-medium text-quasar-black">
                    {activiPerLocatie.get(l.id) ?? 0}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid grid-cols-[1fr_5rem_5rem] gap-x-3 border-t border-gray-200 pt-2 text-sm font-semibold">
              <span className="text-quasar-black">Total unic pe club</span>
              <span className="fnum text-right text-quasar-black">
                {inscrisiTotal}
              </span>
              <span className="fnum text-right text-quasar-black">
                {activiTotal}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
