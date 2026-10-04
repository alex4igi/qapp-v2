import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'

// Banii se înregistrează mereu la locația din bara de sus (unde stă recepția și
// intră în sertar), nu la locația cursului. Avertismentul apare când cele două
// diferă, ca nimeni să nu mai schimbe bara doar ca să găsească un curs
// (04.10.2026: OPEN de la Ștefan plătit cash la Nicolina, banii au ajuns la Ștefan).
export function AltaLocatieWarning({ cursLocatieId }: { cursLocatieId: string | null | undefined }) {
  const { locatieId, locatieNume, options } = useWorkingLocatie()
  if (!cursLocatieId || !locatieId || cursLocatieId === locatieId) return null
  const cursLocatieNume = options.find((o) => o.value === cursLocatieId)?.label ?? 'altă locație'
  return (
    <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Cursul e la <strong>{cursLocatieNume}</strong>. Banii încasați acum se înregistrează la{' '}
      <strong>{locatieNume}</strong>, locația ta din bara de sus. Dacă ești fizic la{' '}
      {cursLocatieNume}, schimbă locația din bara de sus înainte să salvezi.
    </p>
  )
}
