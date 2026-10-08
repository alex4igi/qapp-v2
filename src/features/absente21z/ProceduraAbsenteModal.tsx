import { Badge, Modal } from '@/components/ui'
import { ORDINE_STARI, STARE_PROCEDURA } from './procedura'

function Lista({ titlu, randuri }: { titlu: string; randuri: string[] }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-quasar-gray">{titlu}</h4>
      <ul className="mt-1 space-y-1">
        {randuri.map((r) => (
          <li key={r} className="flex gap-2 text-sm leading-snug text-quasar-black">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-quasar-yellow" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Toată procedura pe o pagină: drumul unui caz de la „De sunat" până la capăt.
export function ProceduraAbsenteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <Modal open title="Procedura — absenți de 21 de zile" onClose={onClose}>
      <div className="space-y-5">
        <p className="rounded-lg border border-line bg-quasar-gray-light/60 px-3 py-2 text-sm">
          Primul apel în 48 h lucrătoare → dacă nu răspunde, al doilea apel peste 7 zile → dacă nici atunci,
          pleacă singur un SMS (a treia încercare) → la 45 de zile fără prezență, managerul confirmă rezilierea
          lunilor neconsumate, iar copilul intră în Nurture.
        </p>
        {ORDINE_STARI.map((s) => {
          const p = STARE_PROCEDURA[s]
          return (
            <section key={s} className="space-y-2 border-t border-line pt-3">
              <div className="flex items-center gap-2">
                <Badge tone={p.ton}>{p.eticheta}</Badge>
                <span className="text-sm text-quasar-gray">{p.inseamna}</span>
              </div>
              <Lista titlu="Ce faci tu" randuri={p.ceFaci} />
              <Lista titlu="Ce face aplicația singură" randuri={p.aplicatia} />
              <p className="text-xs text-quasar-gray">Pe unde iese: {p.iesiri}</p>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
