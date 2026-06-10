import { useMemo, useState } from 'react'
import { Button } from '@/components/ui'

type Props = {
  campanieNume: string
}

function buildEndpoint(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base) return ''
  return base.replace(/\/$/, '') + '/functions/v1/intake-website-lead'
}

function buildSnippet(endpoint: string, campanieNume: string, origin: string) {
  const esc = (s: string) => s.replace(/"/g, '&quot;')
  return `<!-- Quasar Dance — formular intake lead -->
<link rel="stylesheet" href="${origin}/qleads-widget.css">
<script src="${origin}/qleads-widget.js" defer></script>
<button
  type="button"
  data-qleads-trigger
  data-qleads-endpoint="${esc(endpoint)}"
  data-qleads-campanie="${esc(campanieNume)}"
  style="background:#ffd600;color:#000;border:0;padding:12px 24px;border-radius:6px;font-weight:700;cursor:pointer;">
  Înscrie-te acum
</button>`
}

export function WidgetSnippet({ campanieNume }: Props) {
  const [copied, setCopied] = useState(false)
  const endpoint = useMemo(buildEndpoint, [])
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const snippet = useMemo(
    () => buildSnippet(endpoint, campanieNume, origin),
    [endpoint, campanieNume, origin],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (!endpoint) {
    return (
      <p className="text-sm text-red-600">
        VITE_SUPABASE_URL nu e configurat — nu pot genera snippet-ul.
      </p>
    )
  }

  return (
    <details className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Cod embed pentru website (Quasardance.ro)
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-gray-600">
          Lipește acest cod în pagina unde vrei butonul de înscriere. Formularul
          colectează aceleași câmpuri ca „Lead nou" din recepție:
          prenume, nume, nume părinte, telefon, email, data nașterii, interes,
          grupa de vârstă, locație, mesaj.
          UTM-urile din URL sunt capturate automat (utm_source, utm_medium, utm_campaign).
        </p>
        <textarea
          readOnly
          className="h-44 w-full rounded border border-gray-300 bg-white p-2 font-mono text-xs"
          value={snippet}
        />
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? 'Copiat ✓' : 'Copiază cod'}
        </Button>
      </div>
    </details>
  )
}
