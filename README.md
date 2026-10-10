# Historia Clínica · AHP Web

Programa web de **historia clínica y agenda** que reemplaza a ARCOCOV / ArbokCorp Health Professional (AHP).
Usa **los mismos pacientes, historias, evoluciones, órdenes, adjuntos y citas** del archivo `AHP Datos.mdb`.

- **Página web:** GitHub Pages (sólo contiene el programa; **ningún dato de pacientes**).
- **Base de datos:** Supabase (PostgreSQL), protegida con usuario y contraseña y reglas de seguridad por fila (RLS).

---

## Qué hace

| Módulo | Funciones |
|---|---|
| **Agenda** | Vista por día y por semana, horario y receso, colores por tipo de cita (Nueva, Control, Revisión, Procedimiento, Cirugía…), estados (asignada, confirmada, en sala de espera, en consulta, atendida, no asistió, cancelada), sala de espera y notas del día. **Se actualiza sola**: lo que agenda recepción le aparece al médico sin recargar. **Doble clic en una cita abre la historia clínica del paciente.** |
| **Pacientes** | Búsqueda por **cédula, nombre (parcial, sin importar tildes) o número de historia**. Registro y edición de datos. |
| **Ficha del paciente** | *Resumen* (última consulta, antecedentes, próxima cita) · *Historia clínica* completa con buscador interno e impresión · *Nueva consulta* (historia clínica o evolución, con borrador y firma) · *Exámenes y órdenes* (adjuntos PDF/JPG para ver e imprimir, órdenes de laboratorio, imágenes y fórmulas desde plantillas) · *Citas* · *Datos personales*. |
| **Usuarios** | Médico y recepción; **todos son administradores**: agendan, consultan y crean usuarios. |
| **Configuración** | Encabezado de impresión, agendas y horarios, plantillas de órdenes, entidades. |
| **Importar datos** | Lee `AHP Datos.mdb` **en el navegador** y carga todo a Supabase. Se puede repetir: sólo agrega lo nuevo. Sube los archivos adjuntos desde la carpeta del programa anterior. |
| **Auditoría** | Quién abrió qué historia y quién creó o modificó qué, con fecha y hora. |

**Normativa (Res. 1995 de 1999 / Ley 1581 de 2012):** un documento clínico **firmado no se puede modificar ni borrar** (lo bloquea la base de datos); las correcciones se hacen con **notas aclaratorias** con autor, fecha y hora. Todo acceso y cambio queda en auditoría. La sesión se cierra tras 60 minutos sin actividad.

---

## Instalación (una sola vez)

### 1. Supabase
1. Entre a su proyecto de Supabase (uno **distinto** al de Safety).
2. **SQL Editor → New query**: pegue todo el contenido de `supabase/schema.sql` y presione **Run**. Debe terminar sin errores.
3. **Authentication → Sign In / Providers → Email**: desactive **"Confirm email"** y guarde. Así los usuarios que se crean desde la app pueden entrar de inmediato.
4. **Project Settings → API**: copie la **Project URL** y la **anon public key** (o *publishable key*).

### 2. Configurar la conexión
Abra `config.js` y pegue los dos datos:
```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```
La anon key es pública por diseño. **Nunca** ponga la `service_role` key.

### 3. GitHub Pages
1. Cree un repositorio nuevo (por ejemplo `historia-clinica`).
2. Suba **todos** los archivos de esta carpeta (`index.html`, `config.js`, `js/`, `vendor/`, `supabase/`, `README.md`, `.gitignore`). En la web de GitHub: **Add file → Upload files** y arrastre la carpeta.
3. **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. En 1-2 minutos queda en `https://SU-USUARIO.github.io/historia-clinica/`.

> El repositorio puede ser público porque **no contiene datos**. **Nunca** suba el archivo `.mdb` ni los adjuntos (el `.gitignore` lo evita).

### 4. Primer ingreso e importación
1. Abra la página: como aún no hay usuarios, le pedirá **crear el administrador inicial**. Créelo como **Médico**.
2. Menú **Importar datos → Seleccionar archivo .mdb** → elija `AHP Datos.mdb` → **Importar todo**. Tarda unos segundos o pocos minutos.
3. En la misma pantalla, **Seleccionar carpeta de adjuntos**: elija la carpeta donde ARCOCOV guarda los archivos (en el servidor `\\OFICINA1\ArbokCorp Health Professional\AHP Datos\…`). La app empareja cada archivo con su paciente y lo sube. Si se interrumpe, repítalo: continúa con los que falten.
4. Menú **Usuarios → Nuevo usuario**: cree el usuario de **recepción**.

### 5. Día del cambio
Mientras sigan usando ARCOCOV, pueden **volver a importar** el `.mdb` más reciente cuantas veces quieran: sólo se agregan pacientes, consultas y citas nuevas, sin duplicar.

---

## Uso diario

- **Recepción** → *Agenda* → **Agendar cita** → busca el paciente por cédula o nombre (si no existe, **Registrar paciente nuevo**) → elige hora libre → **Agendar**. Cuando llega el paciente: clic en la cita → **Llegó · pasar a sala de espera**.
- **Médico** → *Agenda* → ve la cita (y la sala de espera) → **doble clic** → se abre la historia con la última consulta, antecedentes y exámenes → **Nueva consulta** → escribe → **Firmar y guardar**. La cita queda como *atendida*.
- **Imprimir**: historia completa o por fechas, una consulta, una orden o un examen adjunto.

---

## Costos y respaldo

- **Plan gratuito de Supabase**: 500 MB de base de datos (sobra para los datos de texto) y **1 GB de archivos**. Los adjuntos de ARCOCOV (unos 4.850 PDF/JPG) podrían pasar de 1 GB; la app avisa antes de subir si es el caso.
- Para información clínica (custodia mínima de 15 años) se recomienda el **plan Pro** de Supabase, que incluye **copias de seguridad diarias** y no pausa el proyecto por inactividad.
- Guarde también una copia del `AHP Datos.mdb` original y de la carpeta de adjuntos.

## Estructura

```
index.html          interfaz y estilos
config.js           conexión a Supabase (editar)
js/core.js          sesión, utilidades, impresión
js/agenda.js        agenda, citas, sala de espera
js/pacientes.js     búsqueda, ficha, historia, consultas, órdenes, adjuntos
js/admin.js         usuarios, configuración, auditoría
js/importar.js      importador de ARCOCOV (.mdb) y subida de adjuntos
vendor/             supabase-js 2.115.0 y lector de Access (mdb-reader 3.2)
build/              receta para volver a construir vendor/ (bash build/construir.sh)
supabase/schema.sql tablas, seguridad, auditoría, funciones
```
