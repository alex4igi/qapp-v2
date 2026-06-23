import { Button, DateInput, TextInput } from '@/components/ui'
import { newVacantaRow, type VacantaRow } from '../helpers'

type Props = {
  vacante: VacantaRow[]
  setVacante: (v: VacantaRow[]) => void
}

export function Step3Vacante({ vacante, setVacante }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-quasar-gray">
        Adaugă vacanțele cunoscute (Crăciun, Paște, etc.). Opțional — le
        poți adăuga și ulterior din profilul sezonului.
      </p>
      {vacante.length === 0 ? (
        <p className="text-sm text-quasar-gray">
          Nicio vacanță încă. Folosește butonul de mai jos.
        </p>
      ) : (
        <div className="space-y-2">
          {vacante.map((v, idx) => (
            <div
              key={v.key}
              className="grid grid-cols-[1fr_160px_160px_auto] gap-2"
            >
              <TextInput
                placeholder="Vacanță de Crăciun"
                value={v.nume}
                onChange={(e) => {
                  const next = [...vacante]
                  next[idx] = { ...v, nume: e.target.value }
                  setVacante(next)
                }}
              />
              <DateInput
                value={v.data_incepere}
                onChange={(e) => {
                  const next = [...vacante]
                  next[idx] = { ...v, data_incepere: e.target.value }
                  setVacante(next)
                }}
              />
              <DateInput
                value={v.data_final}
                onChange={(e) => {
                  const next = [...vacante]
                  next[idx] = { ...v, data_final: e.target.value }
                  setVacante(next)
                }}
              />
              <Button
                variant="danger"
                onClick={() => setVacante(vacante.filter((x) => x.key !== v.key))}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="secondary"
        onClick={() => setVacante([...vacante, newVacantaRow()])}
      >
        + Vacanță
      </Button>
    </div>
  )
}
