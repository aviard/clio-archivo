# Clío — Índice Analítico
## Guía de instalación y puesta en marcha

Este documento explica, paso a paso, cómo poner el sitio en línea.
No se requiere experiencia técnica. Cada paso tiene instrucciones exactas.

---

## Lo que vas a hacer

1. Crear la hoja de cálculo en Google Sheets (5 minutos)
2. Crear credenciales en Google Cloud (15 minutos)
3. Publicar el sitio en Vercel (5 minutos)
4. Configurar las credenciales en Vercel (5 minutos)
5. Abrir el sitio y comenzar a catalogar

Tiempo total: aproximadamente 30 minutos.

---

## PASO 1 — Crear la hoja de cálculo en Google Sheets

1. Ve a **sheets.google.com** e inicia sesión con tu cuenta de Google.

2. Haz clic en el botón **"+"** (hoja en blanco).

3. En la celda A1 escribe exactamente los siguientes encabezados,
   uno por celda (A1 hasta G1):

   ```
   año | número | título | autor | páginas | dominio | período | etiquetas | etiquetas_nuevas | pdf_url
   ```

   Es decir:
   - A1: `año`
   - B1: `número`
   - C1: `título`
   - D1: `autor`
   - E1: `páginas`
   - F1: `dominio`
   - G1: `período`
   - H1: `etiquetas`
   - I1: `etiquetas_nuevas`
   - J1: `pdf_url`

4. Cambia el nombre de la pestaña inferior de "Hoja 1" a **`Artículos`**
   (haz doble clic sobre la pestaña para editarla).

5. Renombra el archivo a "Clío — Catálogo" (o cualquier nombre que prefieras).

6. **Copia el ID de la hoja.** Está en la URL del navegador:
   ```
   https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
   ```
   Guárdalo en un bloc de notas. Lo necesitarás más adelante.

---

## PASO 2 — Crear credenciales en Google Cloud

Este paso permite que el sitio web lea y escriba en tu hoja de cálculo.

### 2A — Crear el proyecto

1. Ve a **console.cloud.google.com** e inicia sesión con la misma cuenta de Google.

2. En la barra superior, haz clic en el selector de proyectos (dice "My Project"
   o similar) y luego en **"Nuevo proyecto"**.

3. Ponle nombre: `clio-archivo`. Haz clic en **Crear**.

4. Asegúrate de que el proyecto nuevo esté seleccionado en el selector superior.

### 2B — Activar la API de Google Sheets

1. En el menú de la izquierda, ve a **APIs y servicios → Biblioteca**.

2. Busca **"Google Sheets API"**.

3. Haz clic en el resultado y luego en **"Habilitar"**.

### 2C — Crear una API Key (para lectura pública)

1. Ve a **APIs y servicios → Credenciales**.

2. Haz clic en **"+ Crear credenciales"** → **"Clave de API"**.

3. Se creará una clave. Cópiala y guárdala.
   (Opcional pero recomendado: haz clic en "Restringir clave" → selecciona
   "Google Sheets API" para limitar su uso.)

4. Esta es tu **API Key**. La necesitarás más adelante.

### 2D — Crear una cuenta de servicio (para escritura)

1. Todavía en **APIs y servicios → Credenciales**, haz clic en
   **"+ Crear credenciales"** → **"Cuenta de servicio"**.

2. Nombre: `clio-bot`. Haz clic en **"Crear y continuar"**.
   En los pasos siguientes no es necesario asignar roles. Haz clic en **"Listo"**.

3. Verás la cuenta de servicio en la lista. Haz clic sobre ella.

4. Ve a la pestaña **"Claves"** → **"Agregar clave"** → **"Crear clave nueva"**
   → selecciona **JSON** → **"Crear"**.

5. Se descargará un archivo `.json` a tu computadora. Ábrelo con cualquier
   editor de texto (Bloc de notas, TextEdit, etc.).

6. Busca y guarda estos dos valores:
   - `"client_email"` — se ve así: `clio-bot@clio-archivo.iam.gserviceaccount.com`
   - `"private_key"` — un texto largo que empieza con `-----BEGIN PRIVATE KEY-----`

### 2E — Dar acceso a la cuenta de servicio a tu hoja

1. Vuelve a tu hoja de Google Sheets.

2. Haz clic en el botón **"Compartir"** (arriba a la derecha).

3. En el campo de correo, pega el `client_email` de la cuenta de servicio.

4. Dale permiso de **Editor**.

5. Haz clic en **"Enviar"** (ignora el aviso de que no puede recibir emails).

---

## PASO 3 — Publicar el sitio en Vercel

1. Ve a **vercel.com** y crea una cuenta gratuita
   (puedes usar tu cuenta de Google).

2. En el panel principal, haz clic en **"Add New → Project"**.

3. Vercel te pedirá conectar un repositorio de GitHub.
   Si no tienes GitHub, crea una cuenta gratis en **github.com**.

4. En GitHub, crea un repositorio nuevo llamado `clio-archivo`
   y sube todos los archivos de esta carpeta.
   
   **Si no sabes usar GitHub**, la forma más fácil:
   - Instala **GitHub Desktop** (desktop.github.com)
   - Abre la app, arrastra la carpeta del proyecto
   - Haz clic en "Publish repository"

5. De vuelta en Vercel, selecciona el repositorio `clio-archivo`.

6. Vercel detectará automáticamente que es un proyecto Vite/React.
   No cambies nada. Haz clic en **"Deploy"**.

7. En 2–3 minutos el sitio estará en línea con una URL como:
   `https://clio-archivo.vercel.app`

---

## PASO 4 — Configurar las credenciales en Vercel

Aquí es donde conectas todo.

1. En el panel de Vercel, ve a tu proyecto → **Settings → Environment Variables**.

2. Agrega las siguientes variables una por una:

   | Nombre | Valor |
   |--------|-------|
   | `VITE_SHEETS_ID` | El ID largo de tu hoja de Google Sheets (Paso 1, punto 6) |
   | `VITE_SHEETS_API_KEY` | La API Key del Paso 2C |
   | `SHEETS_CLIENT_EMAIL` | El client_email del archivo JSON (Paso 2D, punto 6) |
   | `SHEETS_PRIVATE_KEY` | La private_key completa del archivo JSON (Paso 2D, punto 6) |

   **Importante para `SHEETS_PRIVATE_KEY`:** pega el texto completo,
   incluyendo `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`.
   Vercel maneja los saltos de línea correctamente.

3. Después de agregar todas las variables, ve a **Deployments** y haz clic en
   **"Redeploy"** para que el sitio tome los nuevos valores.

---

## PASO 5 — Abrir el sitio y comenzar a catalogar

1. Ve a tu URL de Vercel (por ejemplo `https://clio-archivo.vercel.app`).

2. El sitio cargará vacío — el índice aún no tiene artículos.

3. Haz clic en la pestaña **"Administración"**.

4. Haz clic en **"5 números"** para comenzar.
   El sistema procesará 5 números de Clío, extrayendo todos los artículos.

5. Cuando termine, haz clic en **"Búsqueda"** — ya verás artículos.

6. Repite hasta completar los 155 números. Puedes hacerlo en varias sesiones;
   el sistema recuerda dónde quedó y nunca reprocesa un número ya catalogado.

**Costo estimado:** procesar los 155 números completos cuesta aproximadamente
$15–25 USD en la API de Anthropic. Es un costo único — una vez catalogado,
el sitio funciona para siempre sin costo adicional por búsquedas.

---

## Dominio propio (opcional)

Si quieres una URL como `cliodominicana.org` en lugar de `clio-archivo.vercel.app`:

1. Compra el dominio en **namecheap.com** o **porkbun.com** (~$12/año).

2. En Vercel → Settings → Domains, escribe tu dominio y sigue las instrucciones.
   Vercel te dirá exactamente qué configurar. Toma 5 minutos.

---

## Preguntas frecuentes

**¿Necesito dejar la computadora encendida mientras cataloga?**
Sí, durante la catalogación. Pero una vez que un número está catalogado,
queda guardado en Google Sheets para siempre. Puedes catalogar 10 números,
cerrar el navegador, y continuar días después.

**¿Qué pasa si hay un error al procesar un número?**
El sistema lo muestra en pantalla y continúa con el siguiente.
Puedes reintentar ese número individualmente después.

**¿Pueden otras personas usar el sitio mientras catalogo?**
Sí. Las búsquedas y el catálogo son públicos. Solo la pestaña
de Administración escribe datos.

**¿Cómo comparto el sitio?**
Con la URL de Vercel. Cualquier persona en el mundo puede usarla
sin cuenta ni contraseña.

**¿Cómo se ve la hoja de Google Sheets?**
Exactamente como un catálogo — una fila por artículo, con año, número,
título, autor, páginas, tema y enlace al PDF. Puedes verla, filtrarla,
y descargarla como Excel en cualquier momento.

---

## Archivos del proyecto

```
clio-archivo/
├── index.html              Página principal
├── vite.config.js          Configuración técnica
├── package.json            Dependencias
├── .env.example            Plantilla de variables de entorno
├── api/
│   └── append.js           Función serverless (escribe en Sheets)
└── src/
    ├── main.jsx            Punto de entrada
    ├── index.css           Estilos globales
    ├── App.jsx             Interfaz completa
    ├── issues.js           Lista de los 155 números de Clío
    ├── sheets.js           Lógica de lectura/escritura en Sheets
    └── catalog.js          Lógica de catalogación con IA
```

---

*Proyecto desarrollado para la Academia Dominicana de la Historia.*
*Catalogación automatizada mediante Claude (Anthropic).*
