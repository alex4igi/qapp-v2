import { supabase } from '@/lib/supabase'

// Atribuirea leadurilor venite pe WhatsApp: site-ul pune un cod („ref Q-7K3MP") în mesajul
// precompletat și salvează click-ul cu sursa lui; recepția lipește primul mesaj în fișă.
// Vezi migrația 20260930140000_whatsapp_clickuri_atribuire.sql.

export type ClickWhatsApp = {
  cod: string
  click_la: string
  pagina: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  are_gclid: boolean
}

export type RezultatCodWhatsApp =
  | ({ gasit: true } & ClickWhatsApp)
  | { gasit: false; motiv: 'fara_cod' | 'cod_necunoscut'; cod?: string }

/** Cu `leadId` null doar caută (previzualizare); altfel copiază atribuirea pe lead. */
export async function leagaClickWhatsApp(
  text: string,
  leadId: string | null = null,
): Promise<RezultatCodWhatsApp> {
  const { data, error } = await supabase.rpc('leaga_click_whatsapp', {
    p_text: text,
    ...(leadId ? { p_lead: leadId } : {}),
  })
  if (error) throw error
  return data as unknown as RezultatCodWhatsApp
}

export async function getClickWhatsApp(id: string): Promise<ClickWhatsApp | null> {
  const { data, error } = await supabase
    .from('whatsapp_clickuri')
    .select('cod, created, pagina, utm_source, utm_medium, utm_campaign, gclid')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    cod: data.cod,
    click_la: data.created,
    pagina: data.pagina,
    utm_source: data.utm_source,
    utm_medium: data.utm_medium,
    utm_campaign: data.utm_campaign,
    are_gclid: data.gclid !== null,
  }
}

/** „Google Ads · campania X" — ce vede recepția, în loc de source/medium. */
export function descriereAtribuire(c: Pick<ClickWhatsApp, 'utm_source' | 'utm_medium' | 'utm_campaign'>): string {
  const src = (c.utm_source ?? '').toLowerCase()
  const med = (c.utm_medium ?? '').toLowerCase()
  let canal: string
  if (src === 'google' && ['cpc', 'ppc', 'paid'].includes(med)) canal = 'Google Ads'
  else if (src === 'google' && med === 'organic') canal = 'Căutare Google'
  else if (['facebook', 'instagram', 'meta', 'fb', 'ig'].includes(src) || src.startsWith('meta')) {
    canal = ['cpc', 'paid', 'paid_social'].includes(med) ? 'Reclamă Meta' : 'Facebook / Instagram'
  } else if (src === 'direct' || !src) canal = 'Direct (fără sursă)'
  else canal = med && med !== '(none)' ? `${c.utm_source} / ${c.utm_medium}` : (c.utm_source ?? '')
  const camp = c.utm_campaign && c.utm_campaign !== '(none)' ? ` · ${c.utm_campaign}` : ''
  return canal + camp
}
