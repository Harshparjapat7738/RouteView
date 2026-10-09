import { useId } from 'react'
import { describeAreaType } from '../../route/utils/describeAreaType.ts'
import { formatDistance, formatDuration } from '../../route/utils/formatRoute.ts'
import { routeColor } from '../../route/utils/routeColors.ts'
import type { RouteSession } from '../../route/types/routeSession.ts'
import { MAX_QUERY_LENGTH } from '../services/passingAreaSearchService.ts'
import type {
  AreaSearchOutcome,
  AreaSearchResult,
  MatchingRoute,
  MultiAreaMatch,
  RouteAreaMatch,
  SelectedArea,
} from '../types/areaSearch.ts'
import { AreaChip } from '../../../ui/AreaChip.tsx'
import { CheckIcon, CloseIcon, SearchIcon } from '../../../ui/Icons.tsx'
import './PassingAreaSearch.css'

const MAX_RESULTS_SHOWN = 6

interface PassingAreaSearchProps {
  /** The current Route Session, or null when there are no calculated routes. */
  session: RouteSession | null
  query: string
  /** Suggestions for `query` (detected areas not yet selected), computed once by the page. */
  outcome: AreaSearchOutcome
  /** The areas chosen as filters, in the order they were chosen. */
  selected: readonly SelectedArea[]
  /** The routes that pass through all / some of the selected areas. */
  multi: MultiAreaMatch
  onQueryChange: (query: string) => void
  /** Adds a suggested area to the selected areas. */
  onAdd: (result: AreaSearchResult) => void
  onRemove: (key: string) => void
  onClear: () => void
  /** Called when the user chooses a route that passes through a found area. */
  onChoose: (routeId: string, areaId: string) => void
  /** Rendered inside the "Add passing area" disclosure: flat, without its own card. */
  compact?: boolean
}

/**
 * "Which of my routes passes through these areas?" Choose one or more of the geographical areas already
 * detected for the current routes; only routes through all of them match. It never contacts Google or any
 * other service.
 */
export function PassingAreaSearch({
  session,
  query,
  outcome,
  selected,
  multi,
  onQueryChange,
  onAdd,
  onRemove,
  onClear,
  onChoose,
  compact = false,
}: PassingAreaSearchProps) {
  const inputId = useId()
  const firstSuggestion = outcome.status === 'found' ? outcome.results[0] : undefined

  return (
    <section className={compact ? 'area-search area-search--compact' : 'area-search'} aria-label="Passing-area search" data-map-overlay={compact ? undefined : ''}>
      <div className="area-search__header">
        <label className="area-search__label" htmlFor={inputId}>
          Passing area
        </label>
        <p className="area-search__hint" id={`${inputId}-hint`}>
          Search only among areas on your calculated routes.
        </p>
      </div>
      <div className="area-search__field">
        <SearchIcon className="area-search__icon" width={20} height={20} />
        <input
          id={inputId}
          className="area-search__input"
          type="search"
          placeholder={selected.length > 0 ? 'Add another area...' : 'Search an area...'}
          value={query}
          maxLength={MAX_QUERY_LENGTH}
          autoComplete="off"
          aria-describedby={`${inputId}-hint`}
          spellCheck={false}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && firstSuggestion !== undefined) {
              event.preventDefault()
              onAdd(firstSuggestion)
            }
          }}
        />
      </div>
      <SelectedAreaChips selected={selected} onRemove={onRemove} onClear={onClear} />

      <div className="area-search__output" aria-live="polite">
        {outcome.status === 'no-routes' && (
          <p className="area-search__message">
            No routes available. Calculate routes first to search for passing areas.
          </p>
        )}
        {outcome.status === 'no-match' && (
          <p className="area-search__message">No passing area found in your calculated routes.</p>
        )}
        {outcome.status === 'found' && session !== null && (
          <AreaSuggestions
            results={outcome.results}
            session={session}
            showRoutes={selected.length === 0}
            onAdd={onAdd}
            onChoose={onChoose}
          />
        )}
        {session !== null && selected.length > 0 && (
          <MatchingRouteSummary multi={multi} session={session} onChoose={onChoose} />
        )}
      </div>
    </section>
  )
}

interface SelectedAreaChipsProps {
  selected: readonly SelectedArea[]
  onRemove: (key: string) => void
  onClear: () => void
}

/** The selected areas as compact removable chips: [ Neharpar × ] [ Sector 88 × ]. */
function SelectedAreaChips({ selected, onRemove, onClear }: SelectedAreaChipsProps) {
  if (selected.length === 0) {
    return null
  }
  return (
    <div className="area-search__chips">
      <ul className="area-search__chip-list" aria-label="Selected areas">
        {selected.map((area) => (
          <AreaChip key={area.key} name={area.areaName} onRemove={() => onRemove(area.key)} />
        ))}
      </ul>
      {selected.length > 1 && (
        <button type="button" className="area-search__clear" onClick={onClear}>
          <CloseIcon width={14} height={14} /> Clear all
        </button>
      )}
    </div>
  )
}

interface MatchingRouteSummaryProps {
  multi: MultiAreaMatch
  session: RouteSession
  onChoose: (routeId: string, areaId: string) => void
}

/** The routes that pass through ALL selected areas, with the areas in the route's own travel order. */
function MatchingRouteSummary({ multi, session, onChoose }: MatchingRouteSummaryProps) {
  const total = multi.selected.length
  if (multi.fullMatches.length === 0) {
    const partial = multi.partialMatches.length
    return (
      <p className="area-search__message area-search__empty" data-tone="warning">
        No route passes through all selected areas.
        {partial > 0 && ` ${partial} ${partial === 1 ? 'route matches' : 'routes match'} some of them.`}
      </p>
    )
  }
  const count = multi.fullMatches.length
  return (
    <>
      <p className="area-search__headline" data-tone="success">
        <CheckIcon width={16} height={16} /> {count} {count === 1 ? 'route passes' : 'routes pass'} through {total === 1 ? 'the selected area' : `all ${total} selected areas`}
      </p>
      <ul className="area-search__routes">
        {multi.fullMatches.map((match) => (
          <li key={match.route.id}>
            <SummaryRouteRow match={match} session={session} onChoose={onChoose} />
          </li>
        ))}
      </ul>
    </>
  )
}

function SummaryRouteRow({ match, session, onChoose }: { match: RouteAreaMatch; session: RouteSession; onChoose: (routeId: string, areaId: string) => void }) {
  const { route, matchedAreas } = match
  const target = matchedAreas[0]
  const chosen = session.selectedRouteId === route.id && matchedAreas.some((area) => area.areaId === session.selectedAreaId)
  return (
    <div className="area-search__route" data-chosen={chosen}>
      <span className="area-search__swatch" style={{ backgroundColor: routeColor(route.index) }} aria-hidden="true" />
      <div className="area-search__route-body">
        <p className="area-search__route-name">Route {route.index + 1}</p>
        <p className="area-search__route-areas">
          {matchedAreas.map((area, index) => (
            <span key={area.areaId}>
              {index > 0 && ' → '}
              <strong>{area.name}</strong>
            </span>
          ))}
        </p>
        <p className="area-search__route-figures">
          {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
        </p>
      </div>
      {target !== undefined && (
        <button
          type="button"
          className="area-search__choose"
          aria-pressed={chosen}
          aria-label={`${chosen ? 'Chosen' : 'Choose'} Route ${route.index + 1} through the selected areas`}
          onClick={() => onChoose(route.id, target.areaId)}
        >
          {chosen ? 'Chosen' : 'Choose Route'}
        </button>
      )}
    </div>
  )
}

interface AreaSuggestionsProps {
  results: readonly AreaSearchResult[]
  session: RouteSession
  /** Show the routes of each suggestion (single-area search). With selected areas only the suggestions are listed. */
  showRoutes: boolean
  onAdd: (result: AreaSearchResult) => void
  onChoose: (routeId: string, areaId: string) => void
}

function AreaSuggestions({ results, session, showRoutes, onAdd, onChoose }: AreaSuggestionsProps) {
  const shown = results.slice(0, MAX_RESULTS_SHOWN)
  const routeCount = new Set(results.flatMap((result) => result.matchingRoutes.map((match) => match.route.id))).size
  const headline =
    results.length === 1
      ? `Found on ${routeCount} ${routeCount === 1 ? 'route' : 'routes'}`
      : `${results.length} matching areas on ${routeCount} ${routeCount === 1 ? 'route' : 'routes'}`

  return (
    <>
      <p className="area-search__headline">{headline}</p>
      <ul className="area-search__results">
        {shown.map((result) => (
          <li key={result.key} className="area-search__result">
            <p className="area-search__area">
              <span className="area-search__area-name">{result.areaName}</span>
              <span className="area-search__area-type">{describeAreaType(result.areaType)}</span>
              <button
                type="button"
                className="area-search__add"
                aria-label={`Add ${result.areaName} to selected areas`}
                onClick={() => onAdd(result)}
              >
                <span aria-hidden="true">+</span> Add
              </button>
            </p>
            {showRoutes && (
              <ul className="area-search__routes">
                {result.matchingRoutes.map((match) => (
                  <li key={match.route.id}>
                    <MatchingRouteRow match={match} session={session} onChoose={onChoose} />
                  </li>
                ))}
              </ul>
            )}
            {!showRoutes && (
              <p className="area-search__message">
                On {result.matchingRoutes.length} {result.matchingRoutes.length === 1 ? 'route' : 'routes'}
              </p>
            )}
          </li>
        ))}
      </ul>
      {results.length > shown.length && (
        <p className="area-search__message">Showing the first {shown.length} areas. Type more to narrow the search.</p>
      )}
    </>
  )
}

interface MatchingRouteRowProps {
  match: MatchingRoute
  session: RouteSession
  onChoose: (routeId: string, areaId: string) => void
}

function MatchingRouteRow({ match, session, onChoose }: MatchingRouteRowProps) {
  const { route, area } = match
  const chosen = session.selectedRouteId === route.id && session.selectedAreaId === area.areaId

  return (
    <div className="area-search__route" data-chosen={chosen}>
      <span className="area-search__swatch" style={{ backgroundColor: routeColor(route.index) }} aria-hidden="true" />
      <div className="area-search__route-body">
        <p className="area-search__route-name">Route {route.index + 1}</p>
        <p className="area-search__route-areas">
          {route.detectedAreas.map((stop, index) => (
            <span key={stop.areaId}>
              {index > 0 && ' → '}
              {stop.areaId === area.areaId ? <strong>{stop.name}</strong> : stop.name}
            </span>
          ))}
        </p>
        <p className="area-search__route-figures">
          {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
        </p>
      </div>
      <button
        type="button"
        className="area-search__choose"
        aria-pressed={chosen}
        aria-label={`${chosen ? 'Chosen' : 'Choose'} Route ${route.index + 1} for ${area.name}`}
        onClick={() => onChoose(route.id, area.areaId)}
      >
        {chosen ? 'Chosen' : 'Choose Route'}
      </button>
    </div>
  )
}
