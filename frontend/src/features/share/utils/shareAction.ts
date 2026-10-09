export interface SharePayload {
  title: string
  text: string
  url?: string
}

/** The browser capabilities used, injectable for tests. */
export interface ShareEnvironment {
  share?: (data: SharePayload) => Promise<void>
  canShare?: (data: SharePayload) => boolean
  writeText?: (text: string) => Promise<void>
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed'
export type CopyOutcome = 'copied' | 'failed'

export function browserShareEnvironment(): ShareEnvironment {
  if (typeof navigator === 'undefined') return {}
  const nav = navigator
  return {
    share: typeof nav.share === 'function' ? (data) => nav.share(data) : undefined,
    canShare: typeof nav.canShare === 'function' ? (data) => nav.canShare(data) : undefined,
    writeText: nav.clipboard && typeof nav.clipboard.writeText === 'function' ? (text) => nav.clipboard.writeText(text) : undefined,
  }
}

/**
 * Native sharing. 'unsupported' means the caller should offer the copy actions instead (no Web Share API, or the browser
 * refuses this payload); 'cancelled' is the person closing the sheet and is not an error.
 */
export async function shareNatively(payload: SharePayload, env: ShareEnvironment): Promise<ShareOutcome> {
  if (!env.share) return 'unsupported'
  try {
    if (env.canShare && !env.canShare(payload)) return 'unsupported'
  } catch {
    return 'unsupported'
  }
  try {
    await env.share(payload)
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException ? error.name === 'AbortError' : (error as { name?: string })?.name === 'AbortError') return 'cancelled'
    return 'failed'
  }
}

export async function copyText(text: string, env: ShareEnvironment): Promise<CopyOutcome> {
  if (!env.writeText) return 'failed'
  try {
    await env.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
