package com.routeview.metro.repository;

import com.routeview.metro.model.MetroNetwork;

/** Source of the current (static) metro network. Never throws: an unavailable network is {@link MetroNetwork#EMPTY}. */
public interface MetroNetworkProvider {

    MetroNetwork current();
}
