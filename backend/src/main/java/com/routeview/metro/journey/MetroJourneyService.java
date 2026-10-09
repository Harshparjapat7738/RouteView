package com.routeview.metro.journey;

import java.util.Optional;

import org.springframework.stereotype.Service;

import com.routeview.metro.model.MetroNetwork;
import com.routeview.metro.repository.MetroNetworkProvider;
import com.routeview.routing.model.TransitInfo;

/** Builds {@link MetroJourney}s from provider transit details and the current static metro network. */
@Service
public class MetroJourneyService {

    private final MetroNetworkProvider networkProvider;

    public MetroJourneyService(MetroNetworkProvider networkProvider) {
        this.networkProvider = networkProvider;
    }

    /** Empty when the route has no metro ride (it is then not a metro journey and must not be presented as one). */
    public Optional<MetroJourney> journeyOf(TransitInfo transit) {
        MetroNetwork network = networkProvider.current();
        return MetroJourneyBuilder.build(transit, network);
    }
}
