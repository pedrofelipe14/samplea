# Publicar sampleá en las tiendas

Todo lo que pide el formulario, listo para copiar y pegar.

## Archivos

- Paquete: `npm run zip` → `dist/samplea-<versión>.zip`. También está en cada [release](https://github.com/pedrofelipe14/samplea/releases).
- Ícono 128×128: `icons/icon128.png`
- Capturas 1280×800, en este orden:
  1. `store/store-1-hero.png`
  2. `store/store-2-editor.png`
  3. `store/store-3-fit.png`
  4. `store/store-4-flow.png`
- Mosaico promocional pequeño 440×280: `store/promo-small-440x280.png`
- Mosaico marquesina 1400×560 (opcional): `store/promo-marquee-1400x560.png`

## Ficha

**Nombre:** Sampleá

**Resumen** (máx. 132 caracteres):
> Grabá el audio de cualquier pestaña sin pérdida, recortá el sample y bajalo en WAV para tu DAW. Todo local, nada se sube.

**Categoría:** Herramientas · **Idioma:** español

**Descripción:**

```
Sampleá es para productores que encuentran sonidos en el navegador: grabá el audio de cualquier pestaña, recortá el sample y llevalo a tu DAW en segundos.

CÓMO FUNCIONA
1. En la pestaña donde suena lo que querés, tocá el ícono de Sampleá (o Alt+Shift+S) y apretá el botón rojo.
2. Cuando pares, se abre el editor con la grabación.
3. Seleccioná la parte que querés, ajustala y bajala en WAV (o arrastrala directo a tu DAW).

GRABACIÓN
• Sin pérdida: graba el audio tal cual sale de la pestaña (float 32, 48 kHz estéreo). Nada de MP3.
• Seguís escuchando la pestaña mientras grabás.
• Medidor de nivel y hasta 10 minutos por grabación.
• El silencio del principio y del final se recorta solo.

EDITOR
• Forma de onda estéreo con zoom, minimapa y regla de tiempo.
• Selección con loop y «cortes sin click» (ajusta los bordes al cruce por cero).
• Recortar, borrar, normalizar, fade in, fade out, invertir, deshacer y rehacer.
• Tap tempo y «encajar»: la selección dura compases exactos al BPM y el loop cierra perfecto.
• Medidor de pico en dB.
• Abrí también tus propios archivos de audio para cortarlos.

EXPORTAR
• WAV de 16 o 24 bits o de 32 bits float.
• Frecuencia original, 44,1 kHz o 48 kHz (remuestreo de alta calidad), estéreo o mono.
• Bajá todo o solo la selección, guardá recortes en la biblioteca o arrastralos a tu DAW.

PRIVACIDAD
Sampleá no tiene servidores ni analíticas y no hace ninguna conexión a internet. Las grabaciones quedan guardadas en tu navegador y solo salen cuando vos las bajás. Es de código abierto: https://github.com/pedrofelipe14/samplea

Respetá los derechos de autor del material que sampleás.
```

**Sitio web:** https://pedrofelipe14.github.io/samplea/

**Política de privacidad:** https://pedrofelipe14.github.io/samplea/privacy.html

## Prácticas de privacidad (Chrome Web Store)

**Propósito único:**
> Grabar el audio de la pestaña que elige el usuario y editarlo para exportarlo como archivo WAV.

**Justificación de permisos:**

- `tabCapture`
  > Es la función principal de la extensión: cuando el usuario toca el botón de grabar en el popup, se captura el audio de la pestaña activa para guardarlo como sample. Nunca graba sin una acción del usuario.
- `offscreen`
  > Las extensiones Manifest V3 necesitan un documento offscreen para recibir el stream de tabCapture y procesarlo con Web Audio. Así la grabación sigue aunque el usuario cierre el popup.
- `unlimitedStorage`
  > Las grabaciones se guardan en IndexedDB, en la computadora del usuario, sin comprimir para no perder calidad. Una grabación de varios minutos pesa cientos de MB y supera la cuota normal.

**¿Usa código remoto?** No. Todo el código está en el paquete.

**Uso de datos:** marcar que **no recopila** ninguno de los tipos de datos (información personal, salud, financiera, autenticación, comunicaciones personales, ubicación, historial web, actividad del usuario, contenido de sitios web). El audio grabado queda solo en el dispositivo y nunca se transmite.

Marcar también las tres certificaciones:
- no vende ni transfiere datos a terceros;
- no los usa para fines ajenos al propósito único;
- no los usa para evaluar créditos.

## Pasos: Chrome Web Store

1. Entrá a https://chrome.google.com/webstore/devconsole con tu cuenta de Google y pagá el registro único de 5 USD.
2. **Nuevo elemento** → subí el `.zip`.
3. Completá la **ficha de Play Store**: descripción, categoría, idioma, imágenes y sitio web.
4. Completá **Prácticas de privacidad**, con los textos de arriba.
5. En **Distribución** elegí *Público* y todos los países.
6. **Enviar para revisión.** Como usa `tabCapture`, la revisión puede tardar algunos días.

## Pasos: Edge Add-ons (gratis)

1. Entrá a https://partner.microsoft.com/dashboard/microsoftedge y registrate como desarrollador (no cuesta nada).
2. **Crear extensión** → subí el mismo `.zip`.
3. Usá los mismos textos e imágenes. Para la política de privacidad, pegá el link de arriba.
4. Enviá a certificación.

## Nueva versión

1. Subí `version` en `manifest.json` y en `package.json`.
2. Corré `npm test` y `npm run zip`.
3. Subí el zip nuevo en cada tienda (en el mismo elemento).
4. Creá un release en GitHub con el zip.
