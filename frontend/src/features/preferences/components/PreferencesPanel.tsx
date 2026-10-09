import { useEffect, useRef } from 'react'
import { FloatingPanel } from '../../../ui/FloatingPanel.tsx'
import { CloseIcon } from '../../../ui/Icons.tsx'
import { TRAVEL_MODE_ICONS } from '../../route/components/travelModeIcons.ts'
import { TRAVEL_MODES, TRAVEL_MODE_INFO } from '../../route/types/travelMode.ts'
import type { PreferencesApi } from '../hooks/usePreferences.ts'
import { CRITERIA, type PreferenceOutcome } from '../types/preferences.ts'
import { describeAccessibility, describeHidden, describeRanking, describeUnapplied, describeUnverified } from '../utils/describePreferences.ts'
import './Preferences.css'

const HINTS: Readonly<Record<(typeof CRITERIA)[number]['id'], string>> = {
  fastest: 'Shortest travel time first.',
  lowestFare: 'Cheapest first, when every route has a comparable fare.',
  fewerTransfers: 'Fewest changes between vehicles first (public transport).',
  lessWalking: 'Least walking to, between and from stops first (public transport).',
}

const ACCESSIBILITY_SWITCHES = [
  { id: 'stepFree', label: 'Prefer step-free stations', hint: 'Routes whose stations are all listed as wheelchair accessible come first. Nothing is hidden.' },
  { id: 'avoidInaccessible', label: 'Avoid inaccessible stations', hint: 'Hides routes that use a station listed as not accessible, when another route exists.' },
] as const

interface PreferencesPanelProps {
  api: PreferencesApi
  /** What the preferences did to the routes on screen; null when there are none yet. */
  outcome: PreferenceOutcome | null
  onClose: () => void
}

/**
 * Compact Preferences panel. Ranking (order) and avoiding (filtering) are separate sections on purpose. Changing a
 * switch only re-orders or re-filters the routes already calculated: it never requests routes.
 */
export function PreferencesPanel({ api, outcome, onClose }: PreferencesPanelProps) {
  const { preferences } = api
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const lines = outcome === null ? [] : [describeRanking(outcome), describeHidden(outcome), ...describeUnapplied(outcome), ...describeAccessibility(outcome), describeUnverified(outcome)].filter((line): line is string => line !== null)

  return (
    <FloatingPanel className="preferences-panel" aria-label="Travel preferences">
      <header className="preferences-panel__header">
        <h2 className="preferences-panel__title" tabIndex={-1} ref={headingRef}>
          Preferences
        </h2>
        <button type="button" className="preferences-panel__close" aria-label="Close preferences" onClick={onClose}>
          <CloseIcon width={22} height={22} />
        </button>
      </header>

      {!api.persisted && <p className="preferences-panel__note">This browser is not keeping your preferences. They will be lost when you close the page.</p>}

      <section className="preferences-section" aria-labelledby="rank-heading">
        <h3 id="rank-heading" className="preferences-section__title">
          Rank routes by
        </h3>
        <p className="preferences-panel__note">Ranking only changes the order. It never hides a route.</p>
        <ul className="preference-list">
          {CRITERIA.map((criterion) => (
            <li key={criterion.id} className="preference-list__row">
              <label className="preference-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={preferences.prefer[criterion.id]}
                  onChange={(event) => api.setPrefer(criterion.id, event.target.checked)}
                />
                <span className="preference-switch__track" aria-hidden="true" />
                <span className="preference-switch__text">
                  <span className="preference-switch__label">Prefer {criterion.label.toLowerCase()}</span>
                  <span className="preference-switch__hint">{HINTS[criterion.id]}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="preferences-panel__note">If several are on, routes are ordered by how well they do on all of them. A preference with missing data is skipped and reported.</p>
      </section>

      <section className="preferences-section" aria-labelledby="access-heading" data-accessibility-section="">
        <h3 id="access-heading" className="preferences-section__title">
          Accessibility
        </h3>
        <p className="preferences-panel__note">
          Uses only what the Metro and Bus datasets state about each station or stop. A station with no statement is shown as unknown, never as accessible. “Prefer less walking” above reduces walking distance; it does not make a journey step-free.
        </p>
        <ul className="preference-list">
          {ACCESSIBILITY_SWITCHES.map((item) => (
            <li key={item.id} className="preference-list__row">
              <label className="preference-switch">
                <input type="checkbox" role="switch" checked={preferences.accessibility[item.id]} onChange={(event) => api.setAccessibility(item.id, event.target.checked)} />
                <span className="preference-switch__track" aria-hidden="true" />
                <span className="preference-switch__text">
                  <span className="preference-switch__label">{item.label}</span>
                  <span className="preference-switch__hint">{item.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="preferences-section" aria-labelledby="avoid-heading">
        <h3 id="avoid-heading" className="preferences-section__title">
          Avoid travel modes
        </h3>
        <p className="preferences-panel__note">Hides journeys that use these modes. Walking to or from a stop is not avoided: use “Less walking”.</p>
        <ul className="avoid-list">
          {TRAVEL_MODES.map((mode) => {
            const Icon = TRAVEL_MODE_ICONS[mode]
            const on = preferences.avoid.includes(mode)
            return (
              <li key={mode}>
                <label className={`avoid-chip${on ? ' avoid-chip--on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={(event) => api.setAvoid(mode, event.target.checked)} />
                  <Icon width={20} height={20} aria-hidden="true" />
                  <span>{TRAVEL_MODE_INFO[mode].label}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="preferences-section" aria-labelledby="effect-heading" aria-live="polite">
        <h3 id="effect-heading" className="preferences-section__title">
          On your current routes
        </h3>
        {outcome === null ? (
          <p className="preferences-panel__note">Find routes to see how your preferences apply. Nothing is requested from here.</p>
        ) : lines.length === 0 ? (
          <p className="preferences-panel__note">Routes are in the provider’s order. No preference changed them.</p>
        ) : (
          <ul className="preferences-effects">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="preferences-panel__footer">
        <button type="button" className="preferences-panel__reset" aria-disabled={api.isDefault} onClick={() => !api.isDefault && api.reset()}>
          Reset preferences
        </button>
        <p className="preferences-panel__privacy">Kept only on this device.</p>
      </div>
    </FloatingPanel>
  )
}
