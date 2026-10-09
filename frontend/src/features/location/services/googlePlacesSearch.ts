import type { LocationSearchService, LocationSelection, LocationSuggestion } from '../types/location.ts'
import { isValidCoordinate } from '../utils/locationValidation.ts'

/**
 * Google Places API (New) implementation of `LocationSearchService`, using the
 * Autocomplete Data API of the Maps JavaScript API.
 *
 * Google objects never leave this file. Create one instance per search field: each
 * instance owns its session token and the predictions of its latest suggestion list.
 *
 * Cost control: the display name comes from the suggestion text, so `fetchFields`
 * requests only `location`. Calling `fetchFields` ends the billing session, after
 * which a new session token is created.
 */
export function createGooglePlacesSearch(places: google.maps.PlacesLibrary): LocationSearchService {
  let sessionToken = new places.AutocompleteSessionToken()
  let predictions = new Map<string, google.maps.places.PlacePrediction>()

  return {
    async suggest(query) {
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        sessionToken,
      })

      const latest = new Map<string, google.maps.places.PlacePrediction>()
      const result: LocationSuggestion[] = []
      for (const { placePrediction } of suggestions) {
        if (!placePrediction) {
          continue
        }
        latest.set(placePrediction.placeId, placePrediction)
        result.push({
          id: placePrediction.placeId,
          primaryText: placePrediction.mainText?.text ?? placePrediction.text.text,
          secondaryText: placePrediction.secondaryText?.text,
        })
      }
      predictions = latest
      return result
    },

    async select(suggestionId) {
      const prediction = predictions.get(suggestionId)
      if (!prediction) {
        throw new Error('Unknown suggestion')
      }

      const place = prediction.toPlace()
      try {
        await place.fetchFields({ fields: ['location'] })
      } finally {
        sessionToken = new places.AutocompleteSessionToken()
      }

      return toLocationSelection(prediction, place)
    },

    async resolve(placeId) {
      const place = new places.Place({ id: placeId })
      await place.fetchFields({ fields: ['location', 'displayName'] })
      const location = place.location
      if (!location || !isValidCoordinate(location.lat(), location.lng())) {
        throw new Error('Place has no valid location')
      }
      return { name: place.displayName?.trim() ?? '', latitude: location.lat(), longitude: location.lng(), placeId }
    },
  }
}

function toLocationSelection(
  prediction: google.maps.places.PlacePrediction,
  place: google.maps.places.Place,
): LocationSelection {
  const location = place.location
  if (!location || !isValidCoordinate(location.lat(), location.lng())) {
    throw new Error('Place has no valid location')
  }
  return {
    name: prediction.mainText?.text ?? prediction.text.text,
    latitude: location.lat(),
    longitude: location.lng(),
    placeId: prediction.placeId,
  }
}
