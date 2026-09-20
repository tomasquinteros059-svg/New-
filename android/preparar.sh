#!/usr/bin/env bash
#
# Deja el proyecto Android listo para compilar.
#
#   ./android/preparar.sh
#
# Arma el demo y copia su salida adentro del APK. Los archivos copiados no se
# versionan: la fuente de verdad son `demo/` y `public/`, y duplicarlos en git
# sería tener dos copias que se desincronizan.
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
cd "$raiz"

npm run demo

recursos="android/app/src/main"

rm -rf "$recursos/assets"
mkdir -p "$recursos/assets"
cp demo/dist/* "$recursos/assets/"

mkdir -p "$recursos/res/mipmap-xxhdpi" "$recursos/res/mipmap-xxxhdpi"
cp public/icono-192.png "$recursos/res/mipmap-xxhdpi/ic_launcher.png"
cp public/icono-512.png "$recursos/res/mipmap-xxxhdpi/ic_launcher.png"

echo "android/ listo para compilar"
