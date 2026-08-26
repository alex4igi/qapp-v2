import { Badge } from '@/components/ui'
import type { Rezultat } from '@/lib/checklist'

type Props = {
  rezultat: Rezultat
  /**
   * Pentru celule de tabel: scurtează DOAR starea „completă" la „✓". Numărul
   * de câmpuri lipsă își păstrează eticheta — o pilulă cu un număr gol nu spune
   * din ce categorie lipsesc.
   */
  compact?: boolean
  className?: string
}

function rezumat(rezultat: Rezultat): string {
  const { lipsaEsentiale: es, lipsaRecomandate: rec } = rezultat
  const parti = [
    es.length ? `Esențiale lipsă: ${es.map((s) => s.eticheta).join(', ')}` : null,
    rec.length ? `Recomandate lipsă: ${rec.map((s) => s.eticheta).join(', ')}` : null,
  ].filter(Boolean)
  return parti.length ? parti.join(' · ') : 'Fișa este completă.'
}

// Pilula de stare a fișei. Detaliul complet stă în `title` — în tabele nu e loc
// pentru lista de câmpuri, dar hover-ul o dă fără să deschizi fișa.
export function ChecklistBadge({ rezultat, compact, className }: Props) {
  const nEs = rezultat.lipsaEsentiale.length
  const nRec = rezultat.lipsaRecomandate.length

  let text: string
  if (nEs > 0) {
    text = `⚠ ${nEs} ${nEs === 1 ? 'esențial' : 'esențiale'}`
  } else if (nRec > 0) {
    text = `${nRec} ${nRec === 1 ? 'recomandat' : 'recomandate'}`
  } else {
    text = compact ? '✓' : '✓ Fișă completă'
  }

  return (
    <span title={rezumat(rezultat)}>
      <Badge tone={rezultat.tone} className={className}>
        {text}
      </Badge>
    </span>
  )
}
