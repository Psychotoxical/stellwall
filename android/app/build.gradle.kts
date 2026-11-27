import groovy.json.JsonSlurper

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.roborazzi)
}

android {
    namespace = "app.stellwall"
    compileSdk {
        version = release(37) { minorApiLevel = 2 }
    }

    defaultConfig {
        applicationId = "app.stellwall"
        minSdk = 29
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"

        // Firebase for push, read from google-services.json when it is there (not in git).
        // Without it the app builds anyway and says that notifications are not set up in this build.
        val fcm = firebaseValues(file("google-services.json"))
        buildConfigField("String", "FCM_APP_ID", "\"${fcm["appId"]}\"")
        buildConfigField("String", "FCM_API_KEY", "\"${fcm["apiKey"]}\"")
        buildConfigField("String", "FCM_PROJECT_ID", "\"${fcm["projectId"]}\"")
        buildConfigField("String", "FCM_SENDER_ID", "\"${fcm["senderId"]}\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.activity.compose)
    implementation(libs.navigation.compose)
    implementation(libs.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.coroutines.android)
    implementation(libs.lifecycle.runtime.compose)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.roborazzi.rule)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.coroutines.test)
    debugImplementation(libs.compose.ui.test.manifest)
}

/** The four values push needs from google-services.json, for this app's package; empty when the file is missing. */
fun firebaseValues(f: File): Map<String, String> {
    val empty = mapOf("appId" to "", "apiKey" to "", "projectId" to "", "senderId" to "")
    if (!f.exists()) return empty
    @Suppress("UNCHECKED_CAST")
    val json = JsonSlurper().parse(f) as Map<String, Any?>
    val info = json["project_info"] as Map<String, Any?>
    val clients = json["client"] as List<Map<String, Any?>>
    val client = clients.firstOrNull { ((it["client_info"] as Map<*, *>)["android_client_info"] as Map<*, *>)["package_name"] == "app.stellwall" } ?: return empty
    return mapOf(
        "appId" to ((client["client_info"] as Map<*, *>)["mobilesdk_app_id"] as String),
        "apiKey" to (((client["api_key"] as List<*>).first() as Map<*, *>)["current_key"] as String),
        "projectId" to (info["project_id"] as String),
        "senderId" to (info["project_number"] as String),
    )
}
