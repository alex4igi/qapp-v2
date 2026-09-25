import { Badge, Checkbox, TextInput, TextArea, Field } from '@/components/ui'
import { ParametriFields } from './ParametriFields'
import { LUNI_SCURT, type KpiDefinitie, type LinieGrila } from './types'

type Props = {
  linie: LinieGrila
  definitie: KpiDefinitie
  readOnly: boolean
  onChange: (patch: Partial<LinieGrila>) => void
}

const num = (v: string) => (v === '' ? null : Number(v))

/**
 * Fișa unui bonus: pondere, condiții descriptive, praguri (procentuale sau
 * afirmative) și sume. Tot ce vede și discută angajatul la evaluare.
 */
export function LinieGrilaCard({ linie, definitie, readOnly, onChange }: Props) {
  const eComision = linie.mod_calcul === 'comision'
  const eAfirmativ = linie.tip_prag === 'afirmativ'

  return (
    <div
      className={`rounded-lg border p-4 ${
        linie.eliminatoriu ? 'border-danger/30 bg-danger-bg/30' : 'border-line'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{definitie.denumire}</span>
            {linie.eliminatoriu && <Badge tone="danger">eliminatoriu</Badge>}
            {linie.are_poarta && <Badge tone="warn">are poartă</Badge>}
            <Badge tone={definitie.sursa === 'auto' ? 'success' : 'neutral'}>
              {definitie.sursa === 'auto' ? 'automat' : 'manual'}
            </Badge>
          </div>
          {definitie.descriere && (
            <p className="mt-1 max-w-2xl text-xs text-muted">{definitie.descriere}</p>
          )}
        </div>

        {!linie.eliminatoriu && (
          <label className="text-xs text-muted">
            <span className="mb-0.5 block">Pondere (%)</span>
            <TextInput
              type="number"
              step="any"
              min={0}
              max={100}
              disabled={readOnly}
              className="w-24"
              value={String(linie.pondere)}
              onChange={(e) => onChange({ pondere: Number(e.target.value || 0) })}
            />
          </label>
        )}
      </div>

      {!linie.eliminatoriu && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {!eAfirmativ && (
            <>
              <label className="text-xs text-muted">
                <span className="mb-0.5 block">Prag standard ({definitie.unitate ?? ''})</span>
                <TextInput
                  type="number" step="0.01" disabled={readOnly}
                  value={linie.prag_standard ?? ''}
                  onChange={(e) => onChange({ prag_standard: num(e.target.value) })}
                />
              </label>
              <label className="text-xs text-muted">
                <span className="mb-0.5 block">Prag peste standard</span>
                <TextInput
                  type="number" step="0.01" disabled={readOnly}
                  value={linie.prag_peste ?? ''}
                  onChange={(e) => onChange({ prag_peste: num(e.target.value) })}
                />
              </label>
            </>
          )}

          {eComision ? (
            <>
              <label className="text-xs text-muted">
                <span className="mb-0.5 block">Comision standard (%)</span>
                <TextInput
                  type="number" step="0.1" disabled={readOnly}
                  value={linie.comision_procent_standard ?? ''}
                  onChange={(e) => onChange({ comision_procent_standard: num(e.target.value) })}
                />
              </label>
              <label className="text-xs text-muted">
                <span className="mb-0.5 block">Comision peste (%) · plafon (lei)</span>
                <div className="flex gap-2">
                  <TextInput
                    type="number" step="0.1" disabled={readOnly}
                    value={linie.comision_procent_peste ?? ''}
                    onChange={(e) => onChange({ comision_procent_peste: num(e.target.value) })}
                  />
                  <TextInput
                    type="number" step="1" disabled={readOnly}
                    value={linie.comision_plafon ?? ''}
                    onChange={(e) => onChange({ comision_plafon: num(e.target.value) })}
                  />
                </div>
              </label>
            </>
          ) : (
            <>
              <label className="text-xs text-muted">
                <span className="mb-0.5 block">
                  Sumă standard (lei)
                  {linie.suma_standard == null && (
                    <span className="ml-1 text-danger">· lipsește</span>
                  )}
                </span>
                <TextInput
                  type="number" step="1" disabled={readOnly}
                  value={linie.suma_standard ?? ''}
                  onChange={(e) => onChange({ suma_standard: num(e.target.value) })}
                />
              </label>
              <label className="text-xs text-muted">
                <span className="mb-0.5 block">
                  Sumă peste standard (lei)
                  {linie.suma_peste == null && (
                    <span className="ml-1 text-danger">· lipsește</span>
                  )}
                </span>
                <TextInput
                  type="number" step="1" disabled={readOnly}
                  value={linie.suma_peste ?? ''}
                  onChange={(e) => onChange({ suma_peste: num(e.target.value) })}
                />
              </label>
            </>
          )}
        </div>
      )}

      <div className="mb-3 grid gap-3 lg:grid-cols-3">
        <Field label={linie.eliminatoriu ? 'Ce anulează bonusul' : 'Condiție SUB standard'}>
          <TextArea
            rows={2} disabled={readOnly}
            value={linie.conditie_sub ?? ''}
            onChange={(e) => onChange({ conditie_sub: e.target.value || null })}
          />
        </Field>
        {!linie.eliminatoriu && (
          <>
            <Field label="Condiție STANDARD">
              <TextArea
                rows={2} disabled={readOnly}
                value={linie.conditie_standard ?? ''}
                onChange={(e) => onChange({ conditie_standard: e.target.value || null })}
              />
            </Field>
            <Field label="Condiție PESTE standard">
              <TextArea
                rows={2} disabled={readOnly}
                value={linie.conditie_peste ?? ''}
                onChange={(e) => onChange({ conditie_peste: e.target.value || null })}
              />
            </Field>
          </>
        )}
      </div>

      <ParametriFields
        schema={definitie.parametri_schema}
        linie={linie}
        readOnly={readOnly}
        onChange={(parametri) => onChange({ parametri })}
      />

      {!linie.eliminatoriu && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-muted">
            Luni în care se evaluează (nimic bifat = toate)
          </div>
          <div className="flex flex-wrap gap-1">
            {LUNI_SCURT.map((eticheta, i) => {
              const luna = i + 1
              const active = linie.luni_active
              const bifat = active == null || active.includes(luna)
              return (
                <button
                  key={luna}
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    const curent = active ?? LUNI_SCURT.map((_, k) => k + 1)
                    const next = curent.includes(luna)
                      ? curent.filter((m) => m !== luna)
                      : [...curent, luna].sort((a, b) => a - b)
                    onChange({ luni_active: next.length === 12 ? null : next })
                  }}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    bifat
                      ? 'bg-quasar-yellow/20 font-medium text-ink'
                      : 'bg-neutral-bg text-muted-2 line-through'
                  }`}
                >
                  {eticheta}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-4">
        <Checkbox
          label="Activ în grilă"
          checked={linie.activ}
          disabled={readOnly}
          onChange={(e) => onChange({ activ: e.target.checked })}
        />
        {!linie.eliminatoriu && (
          <Checkbox
            label="Fără date în lună = se plătește standardul (nu se împarte pe ceilalți)"
            checked={linie.na_standard}
            disabled={readOnly}
            onChange={(e) => onChange({ na_standard: e.target.checked })}
          />
        )}
      </div>
    </div>
  )
}
