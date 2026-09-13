// Garda apelurilor de cron. Cheamă-o PRIMA în orice funcție declanșată de pg_cron.
//
// Varianta veche a acestei verificări trăia copiată în fiecare funcție, scrisă ca
// `if (secret) { verifică }` — iar secretul nu era setat pe proiect, deci ramura nu
// se executa niciodată și oricine putea declanșa cu un POST gol cron-ul care trimite
// SMS-uri și mută leaduri. De-aia garda de aici e necondiționată: fără `CRON_SECRET`
// funcția refuză să lucreze (500), nu „trece mai departe".
//
// Cine cheamă trimite `Authorization: Bearer <CRON_SECRET>`; pentru pg_cron headerul
// e construit de `cron_call_headers()`, care citește secretul din Vault (migrația
// 20260913120000). Aceeași valoare în ambele locuri.
//
// Returnează `null` dacă apelul e legitim, altfel răspunsul de refuzat.
export function refuzaApelStrain(req: Request): Response | null {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) {
    console.error('CRON_SECRET lipsește — funcția de cron nu poate autentifica apelul')
    return Response.json({ error: 'CRON_SECRET neconfigurat' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
