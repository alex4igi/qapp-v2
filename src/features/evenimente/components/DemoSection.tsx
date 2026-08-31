import { useQuery } from '@tanstack/react-query'
import { Field, Select, TextInput } from '@/components/ui'
import { varstaCursOptions } from '@/lib/enums'
import { campaniiOptions, locatiiOptions, saliOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'

export type DemoFields = {
  locatie_id: string
  sala: string
  durata_min: string
  varsta: string
  stil: string
  curs_tinta: string
  campanie: string
}

type Props = {
  value: DemoFields
  onChange: (patch: Partial<DemoFields>) => void
}

// Profilul unei clase demo: ce o face „ca un curs" — unde se ține, cine e grupa
// de vârstă vizată, în ce grupă reală converg participanții, din ce campanie vin.
export function DemoSection({ value, onChange }: Props) {
  const locatii = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions })
  const sali = useQuery({
    queryKey: ['lookup', 'sali', value.locatie_id || null],
    queryFn: () => saliOptions(value.locatie_id || null),
  })
  const campanii = useQuery({ queryKey: ['lookup', 'campanii'], queryFn: campaniiOptions })
  // Grupa țintă poate fi din orice locație: demoul de la Nicolina poate trimite
  // spre o grupă de la Ștefan cel Mare.
  const cursuri = useCursuriOptions({ locatieId: null })

  return (
    <div className="space-y-3 rounded-md border border-quasar-gray-light bg-quasar-yellow/10 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-quasar-gray">
        Clasă demo
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Locație" htmlFor="demo-locatie">
          <Select
            id="demo-locatie"
            placeholder="—"
            options={locatii.data ?? []}
            value={value.locatie_id}
            // Schimbarea locației invalidează sala aleasă (sălile sunt per locație).
            onChange={(e) => onChange({ locatie_id: e.target.value, sala: '' })}
          />
        </Field>
        <Field label="Sală" htmlFor="demo-sala">
          <Select
            id="demo-sala"
            placeholder="—"
            options={sali.data ?? []}
            value={value.sala}
            onChange={(e) => onChange({ sala: e.target.value })}
          />
        </Field>
        <Field label="Durată (min)" htmlFor="demo-durata">
          <TextInput
            id="demo-durata"
            type="number"
            min={0}
            placeholder="60"
            value={value.durata_min}
            onChange={(e) => onChange({ durata_min: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Grupă de vârstă" htmlFor="demo-varsta">
          <Select
            id="demo-varsta"
            placeholder="—"
            options={varstaCursOptions}
            value={value.varsta}
            onChange={(e) => onChange({ varsta: e.target.value })}
          />
        </Field>
        <Field label="Stil" htmlFor="demo-stil">
          <TextInput
            id="demo-stil"
            placeholder="Street Dance, KPOP, Gimnastică…"
            value={value.stil}
            onChange={(e) => onChange({ stil: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Grupa țintă" htmlFor="demo-curs-tinta">
          <Select
            id="demo-curs-tinta"
            placeholder="— se decide la conversie —"
            options={cursuri.data ?? []}
            value={value.curs_tinta}
            onChange={(e) => onChange({ curs_tinta: e.target.value })}
          />
        </Field>
        <Field label="Campanie" htmlFor="demo-campanie">
          <Select
            id="demo-campanie"
            placeholder="—"
            options={campanii.data ?? []}
            value={value.campanie}
            onChange={(e) => onChange({ campanie: e.target.value })}
          />
        </Field>
      </div>

      <p className="text-xs text-quasar-gray">
        Grupa țintă pre-completează înrolarea la conversia leadului. Sala face demoul
        vizibil în calendarul de ocupare, ca să nu se rezerve peste el.
      </p>
    </div>
  )
}
