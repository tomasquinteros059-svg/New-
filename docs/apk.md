# Cómo poner Relevo en el teléfono

## Hoy: instalarla desde el navegador (1 minuto, sin APK)

Relevo es una aplicación web instalable. Una vez desplegada, en el teléfono:

- **Android (Chrome)**: abrir la URL → menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari)**: abrir la URL → Compartir → *Agregar a inicio*.

Queda con su icono, abre a pantalla completa sin barra de direcciones, y en
iPhone es **el requisito** para que funcionen las notificaciones.

Esto no es un premio de consuelo: para una app que necesita sesión, datos en
vivo y permisos por fila, es la forma correcta. No hay tienda, no hay revisión,
y una corrección está en todos los teléfonos apenas se despliega.

---

## Si aun así hace falta un `.apk`

Un APK para esta app no puede empaquetar la aplicación adentro: Relevo se
renderiza en el servidor, con sesión por cookie y permisos en la base de datos.
No hay nada estático que meter en el paquete.

Lo que sí se puede es una **TWA** (*Trusted Web Activity*): un APK delgado que
abre la web a pantalla completa, sin barra del navegador, con el icono y el
nombre de la app. Es exactamente lo que hacen muchas apps de tienda.

### Requisito que hoy no se cumple

La TWA **necesita una URL HTTPS pública**. Es decir: primero hay que desplegar
en Vercel. Un APK armado antes apuntaría a `localhost` y en el teléfono no
abriría nada.

### Los pasos, una vez desplegada

En tu computador, con Node y el JDK instalados:

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://TU-DOMINIO/manifest.webmanifest
bubblewrap build
```

`bubblewrap init` lee el manifiesto que ya está en el repositorio
(`src/app/manifest.ts`): nombre, icono, colores y pantalla de inicio salen de
ahí. La primera corrida ofrece descargar el SDK de Android y crear la clave de
firma; guardá esa clave, porque sin ella no vas a poder publicar una
actualización del mismo APK nunca más.

El resultado es `app-release-signed.apk`.

### El paso que casi todos se saltan

Para que el APK abra **sin la barra del navegador**, el sitio tiene que
reconocer a esa app. Hay que publicar en
`https://TU-DOMINIO/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "cl.tuempresa.relevo",
    "sha256_cert_fingerprints": ["LA HUELLA QUE IMPRIME bubblewrap build"]
  }
}]
```

En este proyecto, ese archivo va en `public/.well-known/assetlinks.json` y se
despliega solo. Sin él, el APK abre pero muestra la barra de direcciones arriba
— funciona, pero se nota que es una web.

### Para descargarlo desde GitHub

Subí el `.apk` como adjunto de una *Release*:

```
GitHub → Releases → Draft a new release → Attach binaries
```

El enlace de descarga queda público y andá directo desde el teléfono. Android
va a pedir permiso para instalar desde fuera de la tienda: es normal y se
acepta una vez.

---

## Por qué no te lo puedo dejar armado

Dos motivos, y el segundo es el que manda:

1. **No hay SDK de Android en este entorno.** Hay JDK 21 y Gradle, pero faltan
   `sdkmanager`, `aapt2`, `apksigner` y `zipalign`.
2. **No hay a dónde apuntar.** La aplicación no está desplegada: no existe la
   URL que el APK tiene que abrir. Cualquier APK que te mandara hoy abriría una
   pantalla en blanco.

El punto 1 se resuelve descargando cosas. El punto 2 se resuelve desplegando, y
eso depende de tus cuentas.
