package com.routeview.bus.journey;

/** Source of the current (static) bus pattern graph. Never throws: an unavailable network is {@link BusNetwork#EMPTY}. */
public interface BusNetworkProvider {

    BusNetwork current();
}
