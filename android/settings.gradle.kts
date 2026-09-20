/*
 * El envoltorio Android de Relevo.
 *
 * No hay código de la app acá adentro: la interfaz es la misma que corre en el
 * navegador. Esto es la cáscara que la lleva al teléfono como aplicación
 * instalable, con ícono propio y sin barra de direcciones.
 */
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "relevo"
include(":app")
