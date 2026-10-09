package com.routeview.area.model;

/**
 * Kind of geographical area. This enum is the single list of area types: the database stores the
 * constant's name, so adding a type means adding a constant here and nothing else.
 *
 * <p>Only geographical areas belong here. Points of interest and businesses (restaurants, hotels,
 * hospitals, petrol pumps, shops, schools, banks, buildings, ...) are outside RouteView's scope
 * and must never be added as area types.
 */
public enum AreaType {
    VILLAGE,
    LOCALITY,
    SUBURB,
    SECTOR,
    TOWN,
    CITY,
    MUNICIPALITY,
    DISTRICT,
    /** A recognisable geographical area that fits none of the other types. */
    OTHER
}
