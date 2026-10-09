import { memo } from 'react'
import { SlidersIcon } from '../../../ui/Icons.tsx'
import type { TravelPreferences } from '../types/preferences.ts'
import { summarizePreferences } from '../utils/describePreferences.ts'
import './Preferences.css'

interface PreferencesSummaryProps {
  preferences: TravelPreferences
  onOpen: () => void
}

/** The one-line entry to the Preferences panel, shown with the route configuration (not on the bare map). */
export const PreferencesSummary = memo(function PreferencesSummary({ preferences, onOpen }: PreferencesSummaryProps) {
  const summary = summarizePreferences(preferences)
  return (
    <button type="button" className="preferences-summary" data-preferences-open="" aria-label={`Travel preferences: ${summary}`} onClick={onOpen}>
      <SlidersIcon width={20} height={20} />
      <span className="preferences-summary__text">
        <span className="preferences-summary__title">Preferences</span>
        <span className="preferences-summary__value">{summary}</span>
      </span>
    </button>
  )
})
