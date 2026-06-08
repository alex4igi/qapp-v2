import { useState, type FormEvent } from 'react'
import { Button, Field, Modal, TextInput } from '@/components/ui'
import type { Sezon } from '@/types/db'
import type { FormState } from './helpers'
import { VacanteTab } from './VacanteTab'

type Props = {
  sezon: Sezon | null
  form: FormState
  set: (key: keyof FormState) => (value: string) => void
  error: string | null
  isEdit: boolean
  isSaving: boolean
  isDeleting: boolean
  onSubmit: (e: FormEvent) => void
  onDelete: () => void
  onClose: () => void
}

// Modal cu tab-uri pentru editarea/crearea unui sezon. Pentru sezoanele
// existente apare și tab-ul „Vacanțe" pentru CRUD pe vacanțe.
export function SezonEditModal({
  sezon,
  form,
  set,
  error,
  isEdit,
  isSaving,
  isDeleting,
  onSubmit,
  onDelete,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'detalii' | 'vacante'>('detalii')
  const showTabs = isEdit

  return (
    <Modal
      open
      title={isEdit ? 'Editează sezon' : 'Sezon nou'}
      onClose={onClose}
      footer={
        tab === 'detalii' ? (
          <>
            {isEdit && (
              <Button
                variant="danger"
                className="mr-auto"
                disabled={isDeleting}
                onClick={onDelete}
              >
                Șterge
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Anulează
            </Button>
            <Button type="submit" form="sezon-form" disabled={isSaving}>
              {isSaving ? 'Se salvează…' : 'Salvează'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Închide
          </Button>
        )
      }
    >
      {showTabs && (
        <div className="mb-3 flex gap-2 border-b border-quasar-gray/40">
          <button
            type="button"
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
              tab === 'detalii'
                ? 'border-quasar-yellow text-quasar-black'
                : 'border-transparent text-quasar-gray hover:text-quasar-black'
            }`}
            onClick={() => setTab('detalii')}
          >
            Detalii
          </button>
          <button
            type="button"
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
              tab === 'vacante'
                ? 'border-quasar-yellow text-quasar-black'
                : 'border-transparent text-quasar-gray hover:text-quasar-black'
            }`}
            onClick={() => setTab('vacante')}
          >
            Vacanțe
          </button>
        </div>
      )}

      {tab === 'detalii' && (
        <form id="sezon-form" onSubmit={onSubmit} className="space-y-3">
          <Field label="Nume sezon" required htmlFor="sez-nume">
            <TextInput
              id="sez-nume"
              value={form.numele_sezonului}
              onChange={(e) => set('numele_sezonului')(e.target.value)}
            />
          </Field>
          <Field label="Tip">
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tip"
                  value="principal"
                  checked={form.tip === 'principal'}
                  onChange={() => set('tip')('principal')}
                />
                Principal
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tip"
                  value="extra"
                  checked={form.tip === 'extra'}
                  onChange={() => set('tip')('extra')}
                />
                Extra (doar facultative)
              </label>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data început" htmlFor="sez-inc">
              <TextInput
                id="sez-inc"
                type="date"
                value={form.data_incepere}
                onChange={(e) => set('data_incepere')(e.target.value)}
              />
            </Field>
            <Field label="Data final" htmlFor="sez-fin">
              <TextInput
                id="sez-fin"
                type="date"
                value={form.data_final}
                onChange={(e) => set('data_final')(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scadență prima rată" htmlFor="sez-scad-prima">
              <TextInput
                id="sez-scad-prima"
                type="date"
                value={form.scadenta_prima_rata}
                onChange={(e) => set('scadenta_prima_rata')(e.target.value)}
              />
            </Field>
            <Field label="Scadență ultima rată" htmlFor="sez-scad-ultima">
              <TextInput
                id="sez-scad-ultima"
                type="date"
                value={form.scadenta_ultima_rata}
                onChange={(e) => set('scadenta_ultima_rata')(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-quasar-gray">
            Termenele lunilor de început (ex. sept.) și de final (ex. iunie) ale
            abonamentului recurent. Necompletate = ziua 15 (ca celelalte luni).
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {tab === 'vacante' && sezon && <VacanteTab sezonId={sezon.id} />}
    </Modal>
  )
}
