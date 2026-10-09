import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Route } from '../../route/types/route.ts'
import type { TravelMode } from '../../route/types/travelMode.ts'
import { ShareIcon } from '../../../ui/Icons.tsx'
import { buildShareLink } from '../utils/shareLink.ts'
import { copyText, shareNatively, browserShareEnvironment, type ShareEnvironment } from '../utils/shareAction.ts'
import { buildShareSummary, shareableOriginId, startsAtCurrentLocation, type ShareEndpoints } from '../utils/shareSummary.ts'
import './Share.css'

interface ShareButtonProps extends ShareEndpoints {
  route: Route | null
  travelMode: TravelMode
  /** Defaults to the browser's; tests pass their own. */
  environment?: ShareEnvironment
  /** The page address the link is built on (without its query). */
  baseUrl?: string
}

type Panel = 'closed' | 'location' | 'copy'

/**
 * Compact Share action for a route. Uses the native share sheet where the browser has one and otherwise offers
 * Copy link / Copy summary. When the journey starts at the current location it first asks whether route details that depend on
 * that location may be included; the default shares without them. Nothing is sent anywhere by RouteView itself.
 */
export function ShareButton({ route, travelMode, start, destination, environment, baseUrl }: ShareButtonProps) {
  const [panel, setPanel] = useState<Panel>('closed')
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const [includeLocation, setIncludeLocation] = useState(false)
  const [manual, setManual] = useState<string | null>(null)
  const manualRef = useRef<HTMLTextAreaElement>(null)
  const panelId = useId()
  const env = useMemo(() => environment ?? browserShareEnvironment(), [environment])
  const current = startsAtCurrentLocation(start)

  function compose(include: boolean) {
    if (destination === null) return null
    const base = baseUrl ?? `${window.location.origin}${window.location.pathname}`
    // The start is a link parameter only when it is a real place; the device position never is.
    const link = destination.placeId
      ? buildShareLink(base, { travelMode, originPlaceId: shareableOriginId(start), destinationPlaceId: destination.placeId })
      : null
    const input = { start, destination, travelMode, route, includeLocationDerived: include }
    return { link, summary: buildShareSummary({ ...input, link: null }), summaryWithLink: buildShareSummary({ ...input, link }) }
  }
  // Re-composed when the journey or the choice changes; cheap and pure.
  const built = useMemo(() => compose(includeLocation), [start, destination, travelMode, route, includeLocation, baseUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (panel === 'closed') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel('closed')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panel])

  useEffect(() => {
    if (manual !== null) manualRef.current?.select()
  }, [manual])

  if (built === null || destination === null) return null

  async function runShare(include: boolean) {
    const composed = compose(include)
    if (composed === null) return
    setStatus(null)
    setManual(null)
    const payload = { title: 'RouteView journey', text: composed.summary, ...(composed.link !== null ? { url: composed.link } : {}) }
    const outcome = await shareNatively(payload, env)
    if (outcome === 'shared') setStatus({ text: 'Shared.', error: false })
    else if (outcome === 'cancelled') setStatus(null)
    else {
      setPanel('copy')
      if (outcome === 'failed') setStatus({ text: 'Sharing did not work. You can copy it instead.', error: true })
    }
  }

  function press() {
    if (panel !== 'closed') {
      setPanel('closed')
      return
    }
    setStatus(null)
    setManual(null)
    if (current) setPanel('location')
    else void runShare(false)
  }

  async function copy(what: 'link' | 'summary') {
    if (built === null) return
    const text = what === 'link' ? built.link : built.summaryWithLink
    if (text === null) return
    const outcome = await copyText(text, env)
    if (outcome === 'copied') {
      setManual(null)
      setStatus({ text: what === 'link' ? 'Link copied.' : 'Summary copied.', error: false })
    } else {
      setManual(text)
      setStatus({ text: 'Could not copy automatically. Select the text below and copy it.', error: true })
    }
  }

  function chooseLocation(include: boolean) {
    setIncludeLocation(include)
    setPanel('closed')
    void runShare(include)
  }

  return (
    <div className="share" data-share="">
      <button type="button" className="share__button" aria-expanded={panel !== 'closed'} aria-controls={panelId} onClick={press} data-share-button="">
        <ShareIcon width={18} height={18} />
        Share
      </button>
      {panel === 'location' && (
        <div className="share__panel" id={panelId} role="group" aria-label="Share from current location" data-share-location="">
          <p className="share__text">
            This journey starts at your current location. Your position is never put in the link. Include route details that depend on where you are?
          </p>
          <div className="share__actions">
            <button type="button" className="share__choice share__choice--primary" autoFocus onClick={() => chooseLocation(false)} data-share-safe="">
              Share without my location
            </button>
            <button type="button" className="share__choice" onClick={() => chooseLocation(true)} data-share-include="">
              Include route details
            </button>
            <button type="button" className="share__choice" onClick={() => setPanel('closed')}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {panel === 'copy' && (
        <div className="share__panel" id={panelId} role="group" aria-label="Copy to share" data-share-copy="">
          <div className="share__actions">
            <button type="button" className="share__choice" disabled={built.link === null} onClick={() => void copy('link')} data-share-copy-link="">
              Copy link
            </button>
            <button type="button" className="share__choice" onClick={() => void copy('summary')} data-share-copy-summary="">
              Copy summary
            </button>
          </div>
          {built.link === null && <p className="share__text">A link is not available for this place; the summary can still be copied.</p>}
          {manual !== null && <textarea ref={manualRef} className="share__manual" readOnly rows={4} value={manual} aria-label="Text to copy" data-share-manual="" />}
        </div>
      )}
      <p className="share__status" role="status" aria-live="polite" data-share-status="" data-error={status?.error === true}>
        {status?.text ?? ''}
      </p>
    </div>
  )
}
