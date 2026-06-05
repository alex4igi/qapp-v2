import { useState } from 'react'
import { Modal } from '@/components/ui'
import { SimpleIncasareForm } from '../../SimpleIncasareForm'
import { AbonamentTab } from './AbonamentTab'
import { TipSelector } from './TipSelector'
import type { TipPlata } from './helpers'

type Props = {
  open: boolean
  onClose: () => void
  onAddInrolare?: (clientId: string) => void
  defaultClientId?: string
}

export function PlataNouaModal({
  open,
  onClose,
  onAddInrolare,
  defaultClientId,
}: Props) {
  const [tip, setTip] = useState<TipPlata>('Abonament')

  return (
    <Modal
      open={open}
      title="Plată nouă"
      onClose={onClose}
      size="xl"
      minHeight="640px"
    >
      <TipSelector value={tip} onChange={setTip} />
      {tip === 'Abonament' ? (
        <AbonamentTab
          onClose={onClose}
          onAddInrolare={onAddInrolare}
          defaultClientId={defaultClientId}
        />
      ) : (
        <SimpleIncasareForm
          key={tip}
          tip={tip}
          onClose={onClose}
          defaultClientId={defaultClientId}
        />
      )}
    </Modal>
  )
}
