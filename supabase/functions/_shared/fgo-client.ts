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
    .select('id, nume, prenume, familia, facturare_pf_nume, facturare_pf_cnp, facturare_pf_adresa')
    .eq('id', clientId)
    .maybeSingle()

  const clientNume = fullName(client)
  let familiaId: string | null = null

  if (client?.familia) {
    const { data: fam } = await admin
      .from('familii')
      .select('id, nume_familie, factura_pe_firma, firma_denumire, firma_cif, firma_reg_com, firma_adresa')
      .eq('id', client.familia)
      .maybeSingle()
    familiaId = fam?.id ?? null
    if (fam?.factura_pe_firma && fam.firma_cif) {
      return {
        fgoClient: {
          tip: 'PJ',
          denumire: fam.firma_denumire || fam.nume_familie || 'Firmă',
          cui: fam.firma_cif,
          regCom: fam.firma_reg_com,
          adresa: fam.firma_adresa,
        },
        familiaId,
        clientNume,
      }
    }
  }

  if (client?.facturare_pf_nume) {
    return {
      fgoClient: {
        tip: 'PF',
        denumire: client.facturare_pf_nume,
        cnp: client.facturare_pf_cnp,
        adresa: client.facturare_pf_adresa,
      },
      familiaId,
      clientNume,
    }
  }

  return { fgoClient: { tip: 'PF', denumire: clientNume || 'Client' }, familiaId, clientNume }
}
