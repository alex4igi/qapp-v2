import { Button, Modal, Select, TextInput } from '@/components/ui'
import { ARTICOLE_FGO } from './constants'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ART_SET = new Set<string>(ARTICOLE_FGO)
const artOptions = [
  { value: '', label: '— alege articol —' },
  ...ARTICOLE_FGO.map((a) => ({ value: a, label: a })),
]

export type LineDraft = { denumire: string; suma: number }

// Modalul de emitere manuală a unei facturi FGO (folosit de Plăți portal și Clienți):
// recepția alege articolul FGO / editează descrierea pe fiecare linie, apoi confirmă.
export function EmitFacturaModal({
  open,
  clientNume,
  lines,
  onLinesChange,
  onConfirm,
  pending,
  error,
  onClose,
}: {
  open: boolean
  clientNume: string
  lines: LineDraft[]
  onLinesChange: (lines: LineDraft[]) => void
  onConfirm: () => void
  pending: boolean
  error: string | null
  onClose: () => void
}) {
  const totalLinii = lines.reduce((a, l) => a + l.suma, 0)
  const allFilled = lines.length > 0 && lines.every((l) => l.denumire.trim().length > 0)

  const setLine = (i: number, denumire: string) =>
    onLinesChange(lines.map((x, j) => (j === i ? { ...x, denumire } : x)))

  return (
    <Modal
      open={open}
      title="Emite factură FGO"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Anulează
          </Button>
          <Button
            variant="primary"
            disabled={!allFilled || pending}
            title={!allFilled ? 'Completează articolul pe toate liniile' : undefined}
            onClick={onConfirm}
          >
            {pending ? 'Se emite…' : 'Confirmă și emite'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink">
          Se va emite o factură fiscală reală (FGO + e-Factura) pentru{' '}
          <strong>{clientNume}</strong>.
        </p>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-56 shrink-0">
                <Select
                  options={artOptions}
                  value={ART_SET.has(l.denumire) ? l.denumire : ''}
                  onChange={(e) => setLine(i, e.target.value)}
                />
              </div>
              <div className="flex-1">
                <TextInput
                  value={l.denumire}
                  placeholder="Descriere linie factură"
                  onChange={(e) => setLine(i, e.target.value)}
                />
              </div>
              <div className="w-28 text-right whitespace-nowrap text-ink">{fmt(l.suma)} RON</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Alege articolul FGO din listă (completează descrierea) sau editează textul liber.
          Firma emitentă: Quasar Dance Studio SRL · TVA 21%.
        </p>
        <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
          <span>Total factură</span>
          <span>{fmt(totalLinii)} RON</span>
        </div>
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-red-700">{error}</div>}
      </div>
    </Modal>
  )
}
