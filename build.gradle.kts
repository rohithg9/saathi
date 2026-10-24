plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android {
  namespace = "com.exoralabs.saathi.wear"; compileSdk = 35
  defaultConfig { applicationId = "com.exoralabs.saathi"; minSdk = 30; targetSdk = 35; versionCode = 1; versionName = "0.1.0" }
  buildFeatures { compose = true }
}
dependencies {
  implementation("androidx.activity:activity-compose:1.9.3")
  implementation("androidx.wear.compose:compose-material:1.4.0")
  implementation("androidx.wear.compose:compose-foundation:1.4.0")
  implementation("com.google.android.gms:play-services-wearable:19.0.0")
  implementation("androidx.core:core-ktx:1.15.0")
}
