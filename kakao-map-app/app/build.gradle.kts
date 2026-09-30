import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 카카오 키는 git에 올리지 않도록 local.properties 에서 읽습니다.
val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

// 로컬에서는 local.properties, GitHub Actions 에서는 환경 변수(Secrets)에서 읽습니다.
fun localKey(name: String): String =
    (System.getenv(name) ?: localProps.getProperty(name, "")).trim()

val ciKeystore = rootProject.file("release.keystore")

android {
    namespace = "kr.nearby.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "kr.nearby.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "KAKAO_NATIVE_APP_KEY", "\"${localKey("KAKAO_NATIVE_APP_KEY")}\"")
        buildConfigField("String", "KAKAO_REST_API_KEY", "\"${localKey("KAKAO_REST_API_KEY")}\"")
    }

    signingConfigs {
        // GitHub Actions 가 Secrets 로부터 release.keystore 를 만들어 두면 그 키로 서명합니다.
        if (ciKeystore.exists()) {
            create("ci") {
                storeFile = ciKeystore
                storePassword = localKey("KEYSTORE_PASSWORD")
                keyAlias = "nearby"
                keyPassword = localKey("KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (ciKeystore.exists()) signingConfig = signingConfigs.getByName("ci")
        }
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // 카카오맵 SDK v2 (최신 버전: https://apis.map.kakao.com/android_v2/)
    implementation("com.kakao.maps.open:android:2.11.9")

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
