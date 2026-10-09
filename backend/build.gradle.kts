import org.springframework.boot.gradle.plugin.SpringBootPlugin

plugins {
    java
    id("org.springframework.boot") version "4.1.1"
}

group = "com.routeview"
version = "0.1.0-SNAPSHOT"
description = "RouteView backend"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation(platform(SpringBootPlugin.BOM_COORDINATES))

    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    // PostgreSQL + PostGIS: JPA/Hibernate (with Hibernate Spatial for JTS geometry types), Flyway migrations.
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.hibernate.orm:hibernate-spatial")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.compilerArgs.addAll(listOf("-Xlint:unchecked", "-Xlint:deprecation"))
}

tasks.test {
    useJUnitPlatform()
}

// Explicit area import (never runs at normal startup): gradlew importAreas
// Configure with AREA_IMPORT_REGION (or AREA_IMPORT_SOURCE_FILE) in backend/.env; see docs/area-import.md.
tasks.register<org.springframework.boot.gradle.tasks.run.BootRun>("importAreas") {
    group = "routeview"
    description = "Imports geographical areas of the configured region into PostgreSQL/PostGIS."
    mainClass.set("com.routeview.RouteViewApplication")
    classpath = sourceSets["main"].runtimeClasspath
    args("--routeview.area-import.run=true", "--spring.main.web-application-type=none")
}

// Read-only data-quality report of the area table (coverage by type/source, rule violations): gradlew areaQuality
tasks.register<org.springframework.boot.gradle.tasks.run.BootRun>("areaQuality") {
    group = "routeview"
    description = "Prints the area data-quality report (read-only)."
    mainClass.set("com.routeview.RouteViewApplication")
    classpath = sourceSets["main"].runtimeClasspath
    args("--routeview.area-quality.run=true", "--spring.main.web-application-type=none")
}

// Explicit metro import (never runs at normal startup): gradlew importMetro
// Configure METRO_IMPORT_SOURCE_FILE and METRO_IMPORT_SOURCE_VERSION in backend/.env; see docs/metro.md.
tasks.register<org.springframework.boot.gradle.tasks.run.BootRun>("importMetro") {
    group = "routeview"
    description = "Imports the Delhi Metro GTFS dataset (stations, lines, station order) into PostgreSQL/PostGIS."
    mainClass.set("com.routeview.RouteViewApplication")
    classpath = sourceSets["main"].runtimeClasspath
    args("--routeview.metro-import.run=true", "--spring.main.web-application-type=none")
}

// Explicit bus import (never runs at normal startup): gradlew importBus
// Configure BUS_IMPORT_SOURCE_VERSION in backend/.env; the dataset is read from backend/metro.data/bus. See docs/bus.md.
tasks.register<org.springframework.boot.gradle.tasks.run.BootRun>("importBus") {
    group = "routeview"
    description = "Imports the Delhi Bus GTFS dataset (stops, routes, trips, stop times) into PostgreSQL/PostGIS."
    mainClass.set("com.routeview.RouteViewApplication")
    classpath = sourceSets["main"].runtimeClasspath
    args("--routeview.bus-import.run=true", "--spring.main.web-application-type=none")
}
