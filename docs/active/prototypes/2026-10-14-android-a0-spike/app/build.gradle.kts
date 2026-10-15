plugins { id("com.android.application") }
android {
    namespace = "com.youcoded.a0spike"
    compileSdk = 35
    defaultConfig { applicationId = "com.youcoded.a0spike"; minSdk = 28; targetSdk = 35; versionCode = 1; versionName = "0.1"; ndk { abiFilters += "arm64-v8a" } }
    // Throwaway spike: programs ship as lib*.so so Android extracts them to the executable native-lib folder.
    packaging { jniLibs { useLegacyPackaging = true; keepDebugSymbols += "**/*.so" } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
