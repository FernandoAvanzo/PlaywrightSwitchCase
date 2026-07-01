pluginManagement {
    plugins {
        kotlin("jvm") version "2.3.20"
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
rootProject.name = "PlaywrightTestCase"
include("ms-notification-playwright-e2e")
include("ms-voucher-playwright-e2e")
