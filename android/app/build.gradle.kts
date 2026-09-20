plugins {
    id("com.android.application")
}

/*
 * El número de versión sale del contador de compilaciones de GitHub, así cada
 * APK publicado es más nuevo que el anterior y el teléfono lo acepta como
 * actualización en vez de rechazarlo.
 */
val compilacion = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "cl.innovasoulsystem.relevo"
    compileSdk = 35
    /*
     * Fijado a propósito. Sin esto AGP elige su versión preferida, y si no
     * está instalada sale a descargarla; cuando esa descarga necesita aceptar
     * una licencia, el build se queda esperando una respuesta que en CI no
     * va a llegar nunca.
     */
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "cl.innovasoulsystem.relevo"
        minSdk = 24
        targetSdk = 35
        versionCode = compilacion
        versionName = "demo.$compilacion"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    /*
     * Lo único que hace falta. `WebViewAssetLoader` sirve los archivos que
     * viajan dentro del APK bajo un origen https de verdad, en vez de file://.
     * Sin eso no andan ni los módulos de JavaScript ni el almacenamiento local,
     * y el modo oscuro elegido a mano no sobreviviría a cerrar la app.
     */
    implementation("androidx.webkit:webkit:1.12.1")
}
