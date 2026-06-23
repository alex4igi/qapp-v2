import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Modal } from '@/components/ui'

type Props = {
  open: boolean
  title: string
  entityLabel: string
  // Mesaj scurt despre ce se șterge (ex. „instructorul", „cursul").
  noun: string
  // force=true => șterge chiar dacă există dependențe (le orfanizează).
  onConfirm: (force: boolean) => Promise<void>
  onClose: () => void
}

// Confirmare pentru ștergere DEFINITIVĂ (admin). Garda reală e în RPC-ul din DB.
// Flux în 2 pași:
//   1) „Șterge definitiv" încearcă ștergerea normală. Dacă entitatea are dependențe,
//      RPC-ul aruncă errcode QD409 cu lista lor — o arătăm ca reminder de consecințe.
//   2) atunci apare „Șterge oricum", care forțează (datele asociate rămân orfane).
export function DeleteConfirmModal({
  open,
  title,
  entityLabel,
  noun,
  onConfirm,
  onClose,
}: Props) {
  // Lista de dependențe (consecințe) când RPC-ul a blocat ștergerea normală.
  const [blockers, setBlockers] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: (force: boolean) => onConfirm(force),
    onSuccess: () => {
      setBlockers(null)
      onClose()
    },
    onError: (err: unknown) => {
      const code = (err as { code?: string } | null)?.code
      if (code === 'QD409' && err instanceof Error) setBlockers(err.message)
    },
  })

  // Reset la redeschidere, ca să nu rămână starea de la o entitate anterioară.
  useEffect(() => {
    if (open) {
      setBlockers(null)
      run.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const otherError = run.isError && !blockers

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          {blockers ? (
            <Button
              variant="danger"
              onClick={() => run.mutate(true)}
              disabled={run.isPending}
            >
              {run.isPending ? 'Se șterge…' : 'Șterge oricum (orfanizează datele)'}
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={() => run.mutate(false)}
              disabled={run.isPending}
            >
              {run.isPending ? 'Se șterge…' : 'Șterge definitiv'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          Ștergi definitiv {noun}{' '}
          <strong className="text-quasar-black">{entityLabel}</strong>?
        </p>
        <p className="text-xs text-quasar-gray">
          Acțiunea <strong>nu poate fi anulată</strong>. Dacă nu are date asociate, se
          șterge curat. Ștergerea se înregistrează în jurnalul de audit.
        </p>
        {blockers && (
          <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">⚠️ {blockers}</p>
            <p className="text-xs text-amber-800">
              Dacă forțezi ștergerea, aceste date <strong>rămân în sistem dar fără
              legătură</strong> cu {noun} (devin orfane) și pot afecta rapoartele.
              Alternativă recomandată: arhivează în loc de ștergere.
            </p>
          </div>
        )}
        {otherError && (
          <p className="text-sm text-red-600">
            {run.error instanceof Error ? run.error.message : 'Eroare la ștergere.'}
          </p>
        )}
      </div>
    </Modal>
  )
}
