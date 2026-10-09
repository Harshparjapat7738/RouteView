# metro.data

Local transit datasets (GTFS). They are git-ignored; only this README is tracked.

    metro.data/
      metro/   Delhi Metro (DMRC) GTFS: the unzipped folder (stops.txt, routes.txt, trips.txt, stop_times.txt, ...) or its .zip
      bus/     Delhi Bus (DTC + DIMTS) GTFS: the unzipped folder, or its .zip

The Metro dataset may also sit directly in `metro.data/` when it is the only dataset here (the older layout); as soon as a
second dataset is present, the metro import takes the folder named `metro`.

With PostgreSQL running and the version variable set in `backend/.env`, run from `backend/`:

    gradlew importMetro     # needs METRO_IMPORT_SOURCE_VERSION
    gradlew importBus       # needs BUS_IMPORT_SOURCE_VERSION

The two imports are independent: neither touches the other's tables. See docs/metro.md and docs/bus.md.
