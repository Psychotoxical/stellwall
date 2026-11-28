pluginManagement {
    repositories {
        google()
        // Google's copy of Maven Central first: Maven Central answers GitHub's runners with 429 at busy times.
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // Google's copy of Maven Central first: Maven Central answers GitHub's runners with 429 at busy times.
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
    }
}
rootProject.name = "Stellwall"
include(":app")
