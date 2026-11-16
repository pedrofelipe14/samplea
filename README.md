# sampleá

Extensión de navegador para **samplear directo desde una pestaña**: grabás el audio que suena (YouTube, Bandcamp, SoundCloud, lo que sea), lo recortás y lo bajás en WAV para tu DAW.

- **Sin pérdida**: graba el audio crudo de la pestaña (float 32, 48 kHz estéreo), no un MP3 ni un Opus.
- **Seguís escuchando** la pestaña mientras grabás.
- **Editor** con forma de onda estéreo, zoom, selección, loop, cortes sin click (ajusta al cruce por cero), recortar, borrar, normalizar, fades, invertir y deshacer.
- **Exporta** WAV de 16 o 24 bits o de 32 bits float; podés bajar todo o solo la selección, o **arrastrarlo directo a tu DAW**.
- **Biblioteca**: las grabaciones y los recortes quedan guardados en el navegador.
- **Calculadora de tempo**: poné el BPM y te dice cuántos tiempos o compases dura la selección.
- Podés **abrir archivos de audio** (arrastrándolos al editor) para cortarlos con las mismas herramientas.
- Todo pasa en tu computadora: no se manda audio a ningún servidor.

## Instalarla (modo desarrollador)

1. Abrí `chrome://extensions` (o `edge://extensions`).
2. Activá **Modo desarrollador**.
3. Tocá **Cargar extensión sin empaquetar** y elegí esta carpeta.
4. Fijá el ícono en la barra (el alfiler del menú de extensiones).

## Usarla

1. Andá a la pestaña donde suena lo que querés samplear.
2. Tocá el ícono de sampleá (o `Alt+Shift+S`) y apretá el botón rojo.
3. Cuando pares, se abre el editor con la grabación (el silencio del principio y del final se recorta solo).
4. Seleccioná arrastrando sobre la onda, ajustá, y tocá **bajar en WAV** o arrastrá **«arrastrá a tu DAW»**.

Atajos del editor: `Espacio` play · `L` loop · `Shift`+click extiende la selección · rueda = zoom · `Shift`+rueda = moverse · `Z` zoom a la selección · `0` ver todo · `C` recortar · `N` normalizar · `R` invertir · `Supr` borrar · `Ctrl+Z` deshacer.

## Cómo funciona

- `src/background.js` (service worker) pide el stream de la pestaña con `chrome.tabCapture.getMediaStreamId` y crea un documento offscreen.
- `src/offscreen.js` graba con un AudioWorklet (`src/lib/recorder-worklet.js`) y reenvía el audio a los parlantes, porque capturar una pestaña la silencia.
- Las grabaciones se guardan en IndexedDB (`src/lib/db.js`) y el editor (`src/editor.js`) las lee desde ahí.
- `src/lib/wav.js` codifica el WAV y `src/lib/dsp.js` tiene las operaciones de edición.

No tiene dependencias ni paso de build: es JavaScript plano.

## Desarrollo

```sh
npm test        # tests del codificador WAV y de las operaciones de edición (Node 20+)
npm run icons   # regenera los PNG desde icons/icon.svg (usa Edge/Chrome headless)
npm run zip     # arma dist/samplea-<versión>.zip para subir a la tienda (Windows)
```

## Permisos

- `tabCapture`: grabar el audio de la pestaña cuando tocás el botón.
- `offscreen`: el documento invisible que graba mientras el popup está cerrado.
- `unlimitedStorage`: guardar grabaciones largas en la biblioteca.

## Ojo

Respetá los derechos de autor del material que sampleás.

## Licencia

MIT
