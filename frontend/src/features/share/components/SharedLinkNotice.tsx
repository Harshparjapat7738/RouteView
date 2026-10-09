import type { SharedLinkNotice as Notice } from '../hooks/useSharedLink.ts'
import './Share.css'

interface Props {
  notice: Notice
  onRetry: () => void
  onDismiss: () => void
}

function describe(notice: Notice): string {
  switch (notice.kind) {
    case 'invalid':
      return 'This shared link is not valid, or it comes from a version RouteView cannot read. Ask the sender to share the journey again.'
    case 'offline':
      return 'You are offline. Reconnect to open this shared journey: the places are looked up and the routes calculated online.'
    case 'opening':
      return 'Opening the shared journey…'
    case 'failed':
      return `The shared journey could not be opened. ${notice.message}`
    case 'opened':
      return `Shared journey opened. Routes, times and fares are calculated again for you, so they can differ from the sender's.${notice.startMissing ? ' The sender did not share a starting point: choose yours to find routes.' : ''}`
  }
}

/** The one place a shared link reports what happened to it. Errors announce themselves; the rest are polite status messages. */
export function SharedLinkNotice({ notice, onRetry, onDismiss }: Props) {
  const alert = notice.kind === 'invalid' || notice.kind === 'failed'
  return (
    <div className="shared-notice" data-kind={notice.kind === 'invalid' || notice.kind === 'failed' ? 'error' : notice.kind} data-shared-notice={notice.kind} role={alert ? 'alert' : 'status'}>
      <p className="shared-notice__text">{describe(notice)}</p>
      {notice.kind === 'failed' && (
        <button type="button" className="shared-notice__button" onClick={onRetry} data-shared-retry="">
          Try again
        </button>
      )}
      {notice.kind !== 'opening' && (
        <button type="button" className="shared-notice__button" onClick={onDismiss} data-shared-dismiss="">
          Dismiss
        </button>
      )}
    </div>
  )
}
