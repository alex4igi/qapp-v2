// Construirea unitară a clientului FGO pentru un client din CRM (folosită de fluxul
// portal ȘI de emiterea „la cerere"). Precedență:
//   1. PJ familie (factura_pe_firma + firma_cif) — alegere explicită a familiei;
//   2. PF alternativ de pe client (facturare_pf_nume [+ CNP + adresă]);
//   3. PF cu numele clientului.
// NU se folosește la fluxul bancă, unde PF-ul e plătitorul din extras.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { FgoClient } from './fgo.ts'

export type FgoClientContext = {
  fgoClient: FgoClient
  familiaId: string | null
  clientNume: string
}

// Satelitul 1:1 (clienti_facturare / familii_facturare) vine ca obiect din PostgREST,
// dar clientul netipat îl vede ca listă — acceptăm ambele forme.
export function unu<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

function fullName(c: { nume?: string | null; prenume?: string | null } | null): string {
  if (!c) return ''
  return [c.nume, c.prenume].filter(Boolean).join(' ').trim()
}

export async function buildFgoClientForClient(
  admin: SupabaseClient,
  clientId: string | null,
): Promise<FgoClientContext> {
  if (!clientId) {
    return { fgoClient: { tip: 'PF', denumire: 'Client' }, familiaId: null, clientNume: '' }
  }

  const { data: client } = await admin
    .from('clienti')
    .select('id, nume, prenume, familia, pf:clienti_facturare(facturare_pf_nume, facturare_pf_cnp, facturare_pf_adresa)')
    .eq('id', clientId)
    .maybeSingle()

  const clientNume = fullName(client)
  let familiaId: string | null = null

  if (client?.familia) {
    const { data: fam } = await admin
      .from('familii')
      .select('id, nume_familie, factura_pe_firma, firma:familii_facturare(firma_denumire, firma_cif, firma_reg_com, firma_adresa)')
      .eq('id', client.familia)
      .maybeSingle()
    familiaId = fam?.id ?? null
    const firma = unu(fam?.firma)
    if (fam?.factura_pe_firma && firma?.firma_cif) {
      return {
        fgoClient: {
          tip: 'PJ',
          denumire: firma.firma_denumire || fam.nume_familie || 'Firmă',
          cui: firma.firma_cif,
          regCom: firma.firma_reg_com,
          adresa: firma.firma_adresa,
        },
        familiaId,
        clientNume,
      }
    }
  }

  const pf = unu(client?.pf)
  if (pf?.facturare_pf_nume) {
    return {
      fgoClient: {
        tip: 'PF',
        denumire: pf.facturare_pf_nume,
        cnp: pf.facturare_pf_cnp,
        adresa: pf.facturare_pf_adresa,
      },
      familiaId,
      clientNume,
    }
  }

  return { fgoClient: { tip: 'PF', denumire: clientNume || 'Client' }, familiaId, clientNume }
}
