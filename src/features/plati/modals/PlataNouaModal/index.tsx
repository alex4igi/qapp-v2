import { useState } from 'react'
import { Modal } from '@/components/ui'
import { SimpleIncasareForm } from '../../SimpleIncasareForm'
import { AbonamentTab } from './AbonamentTab'
import { OpenClassTab } from './OpenClassTab'
import { DatoriiTab } from './DatoriiTab'
import { TipSelector } from './TipSelector'
import type { TipPlata } from './helpers'

type Props = {
  open: boolean
  onClose: () => void
  onAddInrolare?: (clientId: string) => void
  defaultClientId?: string
  defaultTip?: TipPlata
  defaultBiletId?: string
}

export function PlataNouaModal({
  open,
  onClose,
  onAddInrolare,
  defaultClientId,
  defaultTip,
  defaultBiletId,
}: Props) {
  const [tip, setTip] = useState<TipPlata>(defaultTip ?? 'Abonament')

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
      ) : tip === 'Open' ? (
        <OpenClassTab onClose={onClose} defaultClientId={defaultClientId} />
      ) : tip === 'Datorii' ? (
        <DatoriiTab onClose={onClose} defaultClientId={defaultClientId} />
      ) : (
        <SimpleIncasareForm
          key={tip}
          tip={tip}
          onClose={onClose}
          defaultClientId={defaultClientId}
          defaultBiletId={tip === 'Bilet' ? defaultBiletId : undefined}
        />
      )}
    </Modal>
  )
}
