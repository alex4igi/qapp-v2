import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, TextInput } from '@/components/ui'
import {
  createPortalAccount,
  resetPortalPassword,
  suggestPortalPassword,
  unlinkPortalAccount,
} from '@/lib/portalAccount'

// Secțiune staff pentru gestionarea contului de PORTAL (rol parinte) al unei
// familii sau al unui client individual. Folosită din profilul familiei/clientului.
type Props = {
  kind: 'familie' | 'client'
  id: string
  authUserId: string | null
  defaultEmail?: string | null
  nameHint?: string | null // numele familiei/clientului → parolă sugerată
  invalidateKey: unknown[]
}

export function PortalAccountSection({
  kind,
  id,
  authUserId,
  defaultEmail,
  nameHint,
  invalidateKey,
}: Props) {
  const qc = useQueryClient()
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [password, setPassword] = useState(() => suggestPortalPassword(nameHint))
  const [resetPwd, setResetPwd] = useState(() => suggestPortalPassword(nameHint))
  const [notify, setNotify] = useState<'none' | 'email' | 'sms'>('email')
  const [showReset, setShowReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const target = kind === 'familie' ? { familieId: id } : { clientId: id }
  const refresh = () => qc.invalidateQueries({ queryKey: invalidateKey })

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      await fn()
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold text-quasar-black">Cont portal membru</h2>

      {!authUserId ? (
        <div className="space-y-2">
          <p className="text-sm text-quasar-gray">
            Nu există încă un cont de portal. Creează unul pentru ca {kind === 'familie' ? 'familia' : 'clientul'} să acceseze plăți, prezențe și profil.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput
              type="email"
              placeholder="Email de login"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="flex gap-1">
              <TextInput
                type="text"
                placeholder="Parolă (min. 8)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                title="Generează altă parolă"
                className="rounded-lg border border-gray-200 px-2 text-sm hover:bg-gray-50"
                onClick={() => setPassword(suggestPortalPassword(nameHint))}
              >
                🔄
              </button>
            </div>
            <Button
              disabled={busy || !email || password.length < 8}
              onClick={() =>
                run(async () => {
                  const r = await createPortalAccount({
                    ...target,
                    email,
                    password,
                    notify: notify === 'none' ? undefined : notify,
                  })
                  setMsg(deliveryMsg('Cont creat', notify, r, password))
                  setPassword(suggestPortalPassword(nameHint))
                })
              }
            >
              Creează cont
            </Button>
          </div>
          <NotifyPicker value={notify} onChange={setNotify} />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
              Cont portal activ
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!showReset ? (
              <Button variant="secondary" onClick={() => setShowReset(true)}>
                Resetează parola
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1">
                  <TextInput
                    type="text"
                    placeholder="Parolă nouă (min. 8)"
                    value={resetPwd}
                    onChange={(e) => setResetPwd(e.target.value)}
                  />
                  <button
                    type="button"
                    title="Generează altă parolă"
                    className="rounded-lg border border-gray-200 px-2 text-sm hover:bg-gray-50"
                    onClick={() => setResetPwd(suggestPortalPassword(nameHint))}
                  >
                    🔄
                  </button>
                  <Button
                    disabled={busy || resetPwd.length < 8}
                    onClick={() =>
                      run(async () => {
                        const r = await resetPortalPassword(
                          authUserId,
                          resetPwd,
                          notify === 'none' ? undefined : notify,
                        )
                        setMsg(deliveryMsg('Parolă resetată', notify, r, resetPwd))
                        setResetPwd(suggestPortalPassword(nameHint))
                        setShowReset(false)
                      })
                    }
                  >
                    Salvează parola
                  </Button>
                  <Button variant="ghost" onClick={() => setShowReset(false)}>
                    Anulează
                  </Button>
                </div>
                <NotifyPicker value={notify} onChange={setNotify} />
              </div>
            )}
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Ștergi contul de portal? Accesul va fi revocat.')) return
                run(async () => {
                  await unlinkPortalAccount(target)
                  setMsg('Cont șters.')
                })
              }}
            >
              Șterge cont
            </Button>
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  )
}

// Selector canal de livrare a datelor de acces (datele se trimit prin TheMarketer).
function NotifyPicker({
  value,
  onChange,
}: {
  value: 'none' | 'email' | 'sms'
  onChange: (v: 'none' | 'email' | 'sms') => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-quasar-gray">
      Trimite datele de acces:
      <select
        className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value as 'none' | 'email' | 'sms')}
      >
        <option value="email">Pe email</option>
        <option value="sms">Pe SMS</option>
        <option value="none">Nu trimite (comunic manual)</option>
      </select>
    </label>
  )
}

// Mesaj de rezultat în funcție de canalul ales și de ce s-a trimis efectiv.
function deliveryMsg(
  prefix: string,
  notify: 'none' | 'email' | 'sms',
  r: { emailed?: boolean; smsSent?: boolean },
  password: string,
): string {
  if (notify === 'email') {
    return r.emailed
      ? `${prefix}. Datele au fost trimise pe email.`
      : `${prefix}. ⚠️ Emailul NU a plecat (TheMarketer neconfigurat?) — comunică manual parola: ${password}`
  }
  if (notify === 'sms') {
    return r.smsSent
      ? `${prefix}. Datele au fost trimise pe SMS.`
      : `${prefix}. ⚠️ SMS-ul NU a plecat (lipsă număr sau provider neconfigurat) — comunică manual parola: ${password}`
  }
  return `${prefix}. Parolă: ${password} (comunic-o membrului).`
}
