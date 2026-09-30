import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDateTime } from '@/lib/format'
import { descriereAtribuire, getClickWhatsApp, leagaClickWhatsApp, type ClickWhatsApp } from '../../api'
import { L, inputStyle } from '../styles'

type Props = {
  text: string
  onChange: (v: string) => void
  /** Click-ul deja legat de lead (la editare). */
  clickLegatId: string | null
}

function Linie({ c, ton }: { c: ClickWhatsApp; ton: 'ok' | 'legat' }) {
  return (
    <div style={{ fontSize: '12px', marginTop: '6px', color: ton === 'ok' ? '#1E7A4D' : 'var(--color-muted-2)' }}>
      {ton === 'ok' ? '✓ ' : 'Legat: '}
      <b>{descriereAtribuire(c)}</b> · click pe {formatDateTime(c.click_la)}
      {c.pagina ? ` · ${c.pagina}` : ''}
    </div>
  )
}

// Codul din mesajul precompletat de pe site leagă leadul de click-ul pe WhatsApp —
// de acolo știm dacă omul a venit din Google Ads, căutare sau Facebook.
export function WhatsAppAtribuireSection({ text, onChange, clickLegatId }: Props) {
  const [verificat, setVerificat] = useState('')

  const legatQ = useQuery({
    queryKey: ['whatsapp-click', clickLegatId],
    queryFn: () => getClickWhatsApp(clickLegatId!),
    enabled: Boolean(clickLegatId),
  })
  const previewQ = useQuery({
    queryKey: ['whatsapp-cod', verificat],
    queryFn: () => leagaClickWhatsApp(verificat),
    enabled: verificat.trim() !== '',
    staleTime: 60_000,
  })
  const r = verificat.trim() && text.trim() === verificat.trim() ? previewQ.data : undefined

  return (
    <div style={{ marginTop: '13px' }}>
      <L>Primul mesaj de pe WhatsApp</L>
      <input
        className="qf"
        value={text}
        placeholder="Copiază primul mesaj al omului din WhatsApp și lipește-l aici"
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => setVerificat(e.target.value)}
        style={inputStyle}
      />
      {r?.gasit && <Linie c={r} ton="ok" />}
      {r && !r.gasit && (
        <div style={{ fontSize: '12px', marginTop: '6px', color: '#C2403F' }}>
          {r.motiv === 'fara_cod'
            ? 'Mesajul nu are cod — omul a scris fără butonul de pe site (sau mesajul a fost rescris, nu copiat). Golește câmpul.'
            : `Codul ${r.cod} nu există (sau e mai vechi de 90 de zile). Verifică-l sau golește câmpul.`}
        </div>
      )}
      {!text.trim() && legatQ.data && <Linie c={legatQ.data} ton="legat" />}
      {!text.trim() && !clickLegatId && (
        <div style={{ fontSize: '11.5px', marginTop: '5px', color: 'var(--color-muted)' }}>
          Mesajele scrise din butonul de pe site au un cod ascuns — nu se vede, dar trece la copy-paste. Cu el aflăm din ce reclamă a venit omul. Copiază mesajul, nu-l rescrie.
        </div>
      )}
    </div>
  )
}
