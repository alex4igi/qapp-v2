import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'

// Bara de sus spune unde se înregistrează banii; rețeaua spune unde stă omul.
// Când diferă, cash-ul ar ajunge în sertarul altei locații.
export function ReteaDiferitaWarning() {
  const { locatieId, locatieNume, locatieRetea, locatieReteaNume, setLocatieId } =
    useWorkingLocatie()
  if (!locatieRetea || locatieId === locatieRetea) return null
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>
        Ești în rețeaua de la <strong>{locatieReteaNume}</strong>, dar bara de sus e pe{' '}
        <strong>{locatieNume ?? 'toate locațiile'}</strong>. Banii se înregistrează la locația din bară.
      </span>
      <button
        type="button"
        onClick={() => setLocatieId(locatieRetea)}
        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
      >
        Treci pe {locatieReteaNume}
      </button>
    </div>
  )
}
