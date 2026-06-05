import type { CursRow, Tip, VacantaRow } from '../helpers'

type Props = {
  nume: string
  tip: Tip
  dataIncepere: string
  dataFinal: string
  cursuri: CursRow[]
  vacante: VacantaRow[]
}

export function Step4Rezumat({
  nume,
  tip,
  dataIncepere,
  dataFinal,
  cursuri,
  vacante,
}: Props) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold">Rezumat</p>
      <ul className="space-y-1">
        <li>
          <strong>Nume:</strong> {nume}
        </li>
        <li>
          <strong>Tip:</strong> {tip}
        </li>
        <li>
          <strong>Interval:</strong> {dataIncepere} → {dataFinal}
        </li>
        <li>
          <strong>Cursuri clonate:</strong>{' '}
          {cursuri.filter((c) => c.selected).length}
        </li>
        <li>
          <strong>Vacanțe:</strong>{' '}
          {
            vacante.filter(
              (v) => v.nume.trim() && v.data_incepere && v.data_final,
            ).length
          }
        </li>
      </ul>
      <p className="text-xs text-quasar-gray">
        Sezonul va fi creat cu stare <strong>planificat</strong>. Va deveni
        activ automat la <strong>{dataIncepere}</strong> prin cron-ul de seară.
      </p>
    </div>
  )
}
