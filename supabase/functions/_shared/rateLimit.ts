// Plafon de cereri pentru endpoint-urile publice. Contorul stă în `rate_limit_hits`,
// incrementat atomic de RPC-ul `rate_limit_hit` (vezi migrația 20260921001500).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// IP-ul de încredere. Măsurat pe 21 sept. 2026 pe o funcție publicată: Supabase stă
// în spatele Cloudflare, care rescrie `x-forwarded-for` (valoarea trimisă de client
// dispare) și respinge cu 403 cererile care încearcă să-și pună singure
// `cf-connecting-ip`. Deci acesta e singurul care nu se poate falsifica.
//
// `x-client-ip` îl trimite serverul site-ului, cu IP-ul vizitatorului real — dar
// oricine poate trimite headerul, așa că se crede DOAR când apelantul a dovedit
// secretul de server (`deIncredere`).
export function clientIp(req: Request, deIncredere = false): string {
  if (deIncredere) {
    const dat = req.headers.get('x-client-ip')?.split(',')[0]?.trim()
    if (dat) return dat
  }
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'necunoscut'
  )
}

export type Plafon = { fereastraSec: number; limita: number }

export type RezultatPlafon = {
  permis: boolean
  /** Câte secunde până se eliberează fereastra. Doar când `permis` e false. */
  retryAfter: number
}

/**
 * Un plafon pe (acțiune, cheie). Cheia e de regulă IP-ul, dar poate fi orice
 * (email, token) când asta descrie mai bine abuzul.
 *
 * Dacă limitatorul însuși cade, cererea TRECE: un hopa la baza de date nu are voie
 * să oprească înscrierile sau logările. Eșecul se loghează zgomotos.
 */
export async function verificaPlafon(
  admin: SupabaseClient,
  actiune: string,
  cheie: string,
  plafon: Plafon,
): Promise<RezultatPlafon> {
  try {
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_cheie: `${actiune}:${cheie}`,
      p_fereastra_sec: plafon.fereastraSec,
      p_limita: plafon.limita,
    })
    if (error) throw new Error(error.message)
    const rand = Array.isArray(data) ? data[0] : data
    if (!rand) return { permis: true, retryAfter: 0 }
    if (rand.permis) return { permis: true, retryAfter: 0 }
    const resetSec = Math.max(
      1,
      Math.ceil((new Date(rand.reseteaza_la).getTime() - Date.now()) / 1000),
    )
    console.warn(`[plafon] ${actiune} depășit de ${cheie}: ${rand.n}/${plafon.limita}`)
    return { permis: false, retryAfter: resetSec }
  } catch (e) {
    console.error(`[plafon] ${actiune} NEVERIFICAT (cererea trece):`, e instanceof Error ? e.message : e)
    return { permis: true, retryAfter: 0 }
  }
}

/** Răspunsul standard la depășire. */
export function raspuns429(retryAfter: number, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ error: 'Prea multe cereri. Încearcă din nou peste puțin timp.' }),
    {
      status: 429,
      headers: { ...headers, 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    },
  )
}
