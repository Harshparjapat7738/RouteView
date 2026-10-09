# Production image for the RouteView API (used by Render; see docs/deployment.md).
# Build context is the backend/ folder:  docker build -t routeview-api backend

FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN chmod +x gradlew
COPY src src
# Tests need a PostgreSQL/PostGIS database, which is not available in an image build: run them in CI instead.
RUN ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 --no-create-home routeview
WORKDIR /app
# Only the executable Spring Boot jar is built by bootJar (the "-plain" jar is not), so this matches exactly one file.
COPY --from=build /workspace/build/libs/routeview-backend-*-SNAPSHOT.jar /app/app.jar
USER routeview
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
# The port comes from Render's PORT variable (see application.yml); 8080 is the local default.
EXPOSE 8080
# This image is production only: -Dspring.profiles.active=prod beats a SPRING_PROFILES_ACTIVE=dev copied from a local
# .env into the host's dashboard. The prod profile has no database defaults, so a missing POSTGRES_* setting stops the
# start with a clear message instead of silently trying localhost.
ENTRYPOINT ["java", "-Dspring.profiles.active=prod", "-jar", "/app/app.jar"]
