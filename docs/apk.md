# Cómo poner Relevo en el teléfono

Hay dos caminos y los dos están armados. El APK es el más directo para probar;
la instalación desde el navegador es la que sirve cuando la app esté desplegada
de verdad.

---

## 1. El APK (para probar ahora)

Lo compila GitHub en cada push y queda publicado en una dirección que no cambia:

```
https://github.com/<usuario>/<repo>/releases/latest/download/relevo-demo.apk
```

Se abre esa dirección **desde el teléfono**, se instala, y queda con ícono
propio. Android pide permiso para instalar desde fuera de la tienda: es normal y
se acepta una vez.

### Qué lleva adentro

La interfaz real de Relevo con datos de prueba en memoria. Los mismos
componentes que corren en producción, no una maqueta aparte. Anda sin internet y
sin servidor.

Lo que **no** lleva: sesión, base de datos, persistencia. Al cerrarla vuelve al
estado inicial. Los avisos al teléfono y la subida de evidencia necesitan
servidor y no funcionan.

### Cómo está armado

`android/` es un envoltorio de unas 150 líneas. Tres decisiones que importan:

- **`WebViewAssetLoader`, no `file://`.** Los archivos del APK se sirven bajo un
  origen `https` real. Con `file://` no andarían ni los módulos de JavaScript ni
  el almacenamiento local, y el tema oscuro elegido a mano se perdería al cerrar
  la app.
- **El botón de atrás navega.** Sin eso, atrás cierra la aplicación desde
  cualquier pantalla.
- **Los enlaces externos salen al navegador.** Sin eso, el usuario queda
  atrapado en una página ajena y sin barra de direcciones para volver.

Está firmado con la clave de depuración. Eso alcanza para instalarlo a mano; no
alcanza para repartirlo formalmente ni para publicarlo en Play Store.

### Para compilarlo en tu computador

Hace falta el SDK de Android. Si lo tenés:

```bash
./android/preparar.sh
cd android && gradle assembleDebug
```

Queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

### El día que Relevo esté desplegado

En `android/app/src/main/java/.../PantallaPrincipal.java` hay una constante:

```java
private static final String URL_REMOTA = "";
```

Poniendo ahí la dirección desplegada (`"https://relevo.vercel.app/"`), **este
mismo APK** pasa a abrir la aplicación de verdad, con cuentas y base de datos.
No hay que tocar nada más. Conviene entonces leer también la sección de
`assetlinks.json` más abajo.

---

## 2. Instalar desde el navegador (cuando esté desplegada)

Relevo es una aplicación web instalable. Una vez desplegada, en el teléfono:

- **Android (Chrome)**: abrir la URL → menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari)**: abrir la URL → Compartir → *Agregar a inicio*.

Queda con su ícono, abre a pantalla completa sin barra de direcciones, y en
iPhone es **el requisito** para que funcionen las notificaciones.

Para una app con sesión, datos en vivo y permisos por fila, esta es la forma
correcta: no hay tienda, no hay revisión, y una corrección llega a todos los
teléfonos apenas se despliega.

---

## `assetlinks.json`

Solo hace falta si el APK apunta a una URL desplegada (el caso de `URL_REMOTA`
lleno, o una TWA hecha con Bubblewrap). Sirve para que el sitio reconozca a la
app y esta abra sin la barra del navegador.

Va en `public/.well-known/assetlinks.json` y se despliega solo:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "cl.innovasoulsystem.relevo",
    "sha256_cert_fingerprints": ["LA HUELLA DE LA CLAVE CON QUE SE FIRMÓ"]
  }
}]
```

La huella de la clave de depuración se saca con:

```bash
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android
```
