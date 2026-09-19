import { Link } from 'react-router-dom'

/** Ține locul oricărei pagini din afara listei albe cât timp modul „doar azi" e pornit. */
export function TodayOnlyBlockedPage() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-card p-8 text-center">
      <h1 className="font-display text-lg font-bold text-ink">
        Indisponibil în modul „doar azi"
      </h1>
      <p className="mt-2 text-sm text-muted-2">
        Aplicația arată acum doar ziua curentă de lucru. Pagina asta revine după
        delogare și logare din nou.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex items-center justify-center rounded-[10px] bg-quasar-yellow px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-quasar-yellow-dark"
      >
        Înapoi la ziua de azi
      </Link>
    </div>
  )
}
