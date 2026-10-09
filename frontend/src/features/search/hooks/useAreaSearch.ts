import { useCallback, useMemo, useState } from 'react'
import type { RouteMatch } from '../../route/types/routeMatch.ts'
import type { RouteSession } from '../../route/types/routeSession.ts'
import {
  addSelectedArea,
  matchRoutesByAreas,
  pruneSelectedAreas,
  removeSelectedArea,
  searchAreas,
  toRouteMatches,
  toSelectedArea,
  toTypedRouteMatches,
} from '../services/passingAreaSearchService.ts'
import type { AreaSearchResult, SelectedArea } from '../types/areaSearch.ts'

/** What the route comparison needs to know about the active search. */
export interface RouteSearchView {
  matches: ReadonlyMap<string, RouteMatch>
  /** Names of what is searched for, e.g. "Neharpar + Sector 88" (in selection order). */
  text: string
  /** Number of selected areas; null while the user is only typing. */
  expected: number | null
}

/**
 * Search state: the typed text and the selected areas, both owned by the current Route Session. They are
 * cleared when the session changes (a new calculation or other locations), so a filter never outlives the
 * routes it was chosen from. Everything else is derived from the session; nothing is requested from anywhere.
 */
export function useAreaSearch(session: RouteSession | null) {
  const [query, setQuery] = useState('')
  const [chosen, setSelected] = useState<readonly SelectedArea[]>([])
  const [owner, setOwner] = useState<string | null>(null)

  const sessionId = session?.id ?? null
  if (sessionId !== owner) {
    // Adjust state during render (the documented pattern) instead of an effect, so no stale frame is shown.
    setOwner(sessionId)
    if (owner !== null) {
      setQuery('')
    }
    setSelected([])
  }

  // Searching reads only the session's routes. Selecting a route or a stop creates a new session object with the
  // same routes, so the search is keyed on the routes: choosing a stop never re-runs it or re-renders the cards.
  const routes = session?.routes
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on id + routes (see above)
  const searchSession = useMemo(() => session, [sessionId, routes])

  // Defence in depth: whatever is stored, only areas that exist in the current session are ever used.
  const selected = useMemo(() => pruneSelectedAreas(searchSession, chosen), [searchSession, chosen])

  const reset = useCallback(() => {
    setQuery('')
    setSelected([])
  }, [])
  const clearAreas = useCallback(() => setSelected([]), [])
  const remove = useCallback((key: string) => setSelected((list) => removeSelectedArea(list, key)), [])
  const add = useCallback((result: AreaSearchResult) => {
    setSelected((list) => addSelectedArea(list, toSelectedArea(result)))
    setQuery('')
  }, [])

  const suggestions = useMemo(() => searchAreas(searchSession, query, selected), [searchSession, query, selected])
  const multi = useMemo(() => matchRoutesByAreas(searchSession, selected), [searchSession, selected])

  const view = useMemo<RouteSearchView | null>(() => {
    if (selected.length > 0) {
      return {
        matches: toRouteMatches(multi),
        text: multi.selected.map((area) => area.areaName).join(' + '),
        expected: multi.selected.length,
      }
    }
    if (suggestions.status === 'found') {
      return { matches: toTypedRouteMatches(suggestions), text: suggestions.query, expected: null }
    }
    return null
  }, [selected, multi, suggestions])

  return { query, setQuery, selected, suggestions, multi, view, add, remove, clearAreas, reset }
}
