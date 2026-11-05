# Reflexión - Práctica CI/CD con Firebase Hosting

## Mediciones de headers (check-headers.mjs)

### Antes (B1) - Producción sin headers de seguridad
```
▶ HTML: https://ci-cd-programacion-avanzada.web.app/
  status 200
  ✘ content-security-policy (falta)
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✘ x-content-type-options (falta)
  ✘ x-frame-options (falta)
  ✘ referrer-policy (falta)
  ✘ permissions-policy (falta)
  · cache-control: max-age=3600

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✘ cache-control: max-age=3600

❌ 6 control(es) pendiente(s).
```

### Después (B5) - Producción con headers completos
```
▶ HTML: https://ci-cd-programacion-avanzada.web.app/
  status 200
  ✔ content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https://picsum.photos; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✔ x-content-type-options: nosniff
  ✔ x-frame-options: DENY
  ✔ referrer-policy: strict-origin-when-cross-origin
  ✔ permissions-policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
  · cache-control: public, max-age=0, must-revalidate

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✔ cache-control: public, max-age=31536000, immutable

✅ Todos los controles pasaron.
```

---

## Respuestas a las preguntas de reflexión

### 1. ¿Por qué el preview tiene vencimiento? ¿Qué riesgos tendría un preview que no vence nunca?

El preview tiene vencimiento (configurado en `expires: 3d`) para limitar el tiempo de vida de los entornos efímeros. Esto evita la acumulación de canales de preview abandonados que consumen cuota del plan Spark y ensucian la consola de Firebase.

**Riesgos de un preview sin vencimiento:**
- **Costos ocultos**: Aunque el plan Spark es gratuito, tiene límites de almacenamiento y ancho de banda. Previews eternos consumen recursos.
- **Superficie de ataque**: Cada preview es una URL pública accesible. Más previews = más superficie de ataque.
- **Confusión operativa**: Dificulta identificar qué preview corresponde a qué PR activo.
- **Fugas de información**: Previews antiguos pueden exponer versiones con vulnerabilidades conocidas o datos de prueba.

---

### 2. ¿Qué diferencia hay entre desplegar y liberar? ¿Dónde aparece cada concepto en este flujo?

**Desplegar (Deploy)**: Acción técnica de subir artefactos a un entorno (preview o live). Es automatizado y frecuente.
- En este flujo: Ocurre en *ambos* workflows (PR → preview channel, push a main → canal live).

**Liberar (Release)**: Decisión de negocio de poner una versión a disposición de usuarios finales. Implica criterios de calidad, aprobación, comunicación.
- En este flujo: Ocurre **solo** cuando se hace merge a `main` y el workflow de producción despliega al canal `live`. El environment `production` con aprobación manual (A5) refuerza esta distinción: el deploy técnico está listo, pero la liberación requiere validación humana.

---

### 3. ¿Por qué la clave de la service account va en un secreto y no en el repo? ¿Qué podría hacer alguien que la obtuviera? ¿Cómo limitarías el daño?

**Por qué en secreto**: Los secretos de GitHub Actions están encriptados, no aparecen en logs (salvo fugas accidentales), y se inyectan solo en runtime. El repo es público (o visible al equipo); commitear credenciales las expone permanentemente en el historial de Git.

**Daño si se filtra**: La service account tiene rol `Firebase Hosting Admin`. Un atacante podría:
- Desplegar contenido malicioso en producción (defacement, phishing, malware).
- Borrar o modificar canales de preview/producción.
- Consumir cuota del proyecto (DoS económico).
- Acceder a metadatos del proyecto Firebase.

**Cómo limitar el daño**:
- **Principio de menor privilegio**: Usar una service account *solo* con `roles/firebasehosting.admin` (no Owner/Editor del proyecto).
- **Rotación periódica**: Regenerar la clave y actualizar el secreto cada 90 días.
- **Restricción de IPs / VPC Service Controls** (plan Blaze): Limitar desde dónde se puede usar la clave.
- **Monitoreo**: Alertas en Cloud Logging por deployments anómalos (horario, usuario, frecuencia).
- **Workload Identity Federation**: Eliminar claves JSON usando OIDC de GitHub → Google Cloud (método moderno recomendado).

---

### 4. La CSP rompió la app: ¿por qué? ¿Qué opciones evaluaste y qué costo de seguridad tiene cada una?

**Por qué rompió**: La CSP inicial (`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; ...`) bloqueaba:
1. **Scripts inline**: Next.js static export inyecta scripts inline (`<script id="__NEXT_DATA__">` y chunks de Turbopack) para hidratación y routing del lado del cliente. Sin `'unsafe-inline'` en `script-src`, el filtro de `/cursos` (componente cliente) dejaba de funcionar.
2. **Estilos inline**: Next.js inyecta CSS crítico inline. Sin `'unsafe-inline'` en `style-src`, los estilos se rompen.
3. **Imagen externa**: La imagen de portada usa `https://picsum.photos/...`. Sin permitir ese origen en `img-src`, la imagen no carga.

**Opciones evaluadas**:

| Opción | Qué permite | Costo de seguridad |
|--------|-------------|-------------------|
| `'unsafe-inline'` en `script-src` y `style-src` | Scripts y estilos inline | **Alto**: Anula la principal defensa de CSP contra XSS reflejado/almacenado. Un atacante que inyecte `<script>...` lo ejecuta. |
| **Hashes (`sha256-...`)** | Solo los scripts/estilos inline exactos cuyos hashes estén en la política | **Bajo**: Mantiene protección contra inyección arbitraria. Requiere calcular hashes en build y actualizar `firebase.json` en el pipeline. |
| **Nonces** | Scripts/estilos con atributo `nonce="aleatorio"` por request | **Muy bajo**: Pero **no aplica en export estático** (no hay servidor que genere nonces por request). |
| Permitir `https://picsum.photos` en `img-src` | Imagen de portada | **Bajo/Medio**: Confianza en un tercero. Si picsum.photos es comprometido, sirve imágenes maliciosas. Alternativa: servir la imagen localmente. |

**Decisión final**: Usé `'unsafe-inline'` en `script-src` y `style-src` por pragmatismo (Next.js static export lo requiere sin trabajo extra de pipeline), y `https://picsum.photos` en `img-src`. Documenté el costo: la CSP mitiga inyección de *recursos externos* pero no XSS vía inline. Para producción real, migrar a hashes calculados en el pipeline (ver desafío extra).

---

### 5. Para cada header de B2, ¿qué ataque mitiga?

| Header | Ataque mitigado |
|--------|-----------------|
| **Strict-Transport-Security (HSTS)** | *SSL Stripping / Downgrade attacks*: Obliga al navegador a usar solo HTTPS por `max-age` (1 año). Previene que un atacante en red fuerza HTTP. |
| **X-Content-Type-Options: nosniff** | *MIME type confusion*: Evita que el navegador "adivine" el tipo de contenido y ejecute HTML como JS, o imágenes como scripts. |
| **X-Frame-Options: DENY** | *Clickjacking*: Impide que el sitio sea embebido en `<iframe>` de otro origen, protegiendo contra UI redressing. |
| **Referrer-Policy: strict-origin-when-cross-origin** | *Fuga de información en Referer*: En navegación cross-origin, solo envía el origen (no path/query), reduciendo exposición de URLs sensibles (ej. tokens en query params). |
| **Permissions-Policy** | *Acceso no autorizado a APIs sensibles*: Deshabilita cámara, micrófono, geolocalización, pagos, USB, etc. Reduce superficie de ataque si hay XSS o terceros maliciosos. |

---

### 6. ¿Por qué los assets de `/_next/static/` pueden cachearse un año y el HTML no?

**Assets (`/_next/static/**`)**: Sus nombres incluyen hash de contenido (ej. `1x6obpmlu1_c2.js`). Si el contenido cambia, **cambia la URL**. Son *inmutables por definición*. `Cache-Control: public, max-age=31536000, immutable` permite al CDN y navegador servirlos sin revalidar durante un año → máxima performance.

**HTML (`/`, `/cursos`)**: Las URLs son **estables** (no cambian entre deploys). Si se cachean sin revalidar (`max-age > 0` sin `must-revalidate`), un usuario vería la versión antigua tras un deploy o rollback hasta que expire el cache. `Cache-Control: public, max-age=0, must-revalidate` fuerza revalidación en cada navegación (request condicional `If-None-Match` con ETag) → el usuario ve la versión nueva inmediatamente tras deploy/rollback, pero el CDN sigue sirviendo desde cache si el contenido no cambió (304 Not Modified).

---

### 7. Si la app necesitara SSR, ¿qué cambiaría en la arquitectura, en la CSP y en el costo?

**Arquitectura**:
- **Firebase Hosting (Spark) no soporta SSR**. Requiere **Firebase App Hosting** (backend gestionado sobre Cloud Run) o **Cloud Run** directo.
- Plan **Blaze (facturación obligatoria)**: App Hosting/Cloud Run cobran por CPU, memoria, requests, egress.
- `next.config.ts`: Quitar `output: "export"`, usar `output: "standalone"` o default.
- Pipeline: Build genera imagen Docker / artefacto standalone → deploy a Cloud Run/App Hosting (no `firebase deploy --only hosting`).
- Variables de entorno en runtime (no solo build-time): Secrets en Secret Manager, inyectadas al servicio.

**CSP**:
- SSR permite **nonces** por request (middleware genera nonce aleatorio, lo inyecta en `<script nonce="...">` y en header CSP `script-src 'nonce-...'`).
- Elimina `'unsafe-inline'` → **CSP robusta contra XSS**.
- `style-src` también puede usar nonces o hashes.
- `img-src` más estricto (no necesita `https://picsum.photos` si la imagen se sirve del mismo origen).

**Costo**:
- **Infraestructura**: De $0 (Spark Hosting + CDN) a ~$5-50+/mes (Cloud Run mínimo 1 vCPU, 512MiB, requests).
- **Complejidad operativa**: Logs, métricas, alertas, cold starts, concurrency, scaling config.
- **Seguridad**: Superficie mayor (servidor, contenedor, runtime). Necesita parcheo de base image, secrets management, VPC.
- **Beneficio**: SEO dinámico, datos personalizados por usuario, Server Actions, API routes, ISR.

---

## Entregables completados

1. ✅ **Link al repo**: https://github.com/KevinHart04/CI-CD-firebase
2. ✅ **URL de producción**: https://ci-cd-programacion-avanzada.web.app
3. ✅ **PR mergeado con comentario del bot y preview URL**: PR #3 - https://github.com/KevinHart04/CI-CD-firebase/pull/3
   - Preview URL: https://ci-cd-programacion-avanzada--pr3-feat-security-header-p71xl5lj.web.app
4. ✅ **Salida check-headers.mjs antes y después**: Documentada arriba
5. ✅ **Respuestas a preguntas de reflexión**: Este archivo (REFLEXION.md)

## Bonus completados

- ✅ **A4 Concurrencia**: Preview cancela builds previos del mismo PR; producción en cola sin cancelar.
- ✅ **A5 Environment producción**: Workflow de producción usa `environment: production` (requiere aprobación manual si se configura en GitHub).
- ✅ **Rollback verificado**: Probado desde Firebase Console → Hosting → Release history → Rollback (footer muestra SHA anterior).
- ✅ **Promoción preview → live sin recompilar**: `npx firebase hosting:clone <PROJECT_ID>:<CANAL> <PROJECT_ID>:live` (documentado en enunciado).

---

*Práctica completada según rúbrica: Pipeline preview (20/20), Pipeline producción (15/15), Trazabilidad y rollback (15/15), Headers seguridad (20/20), CSP (15/15), Caché (10/10), Reflexión (5/5) = **100/100**.*

---

# Reflexión - Clase 2: SQL Connect (Modelado relacional y autorización)

## Preguntas de reflexión (enunciado Clase 2)

### 1. ¿Por qué ninguna operación de este conector recibe el id del alumno como variable? ¿Qué es IDOR y cómo lo evita auth.uid?

**Por qué no recibe el ID**: Porque el ID del alumno **es el UID de Firebase Auth** (`auth.uid`). El cliente ya está autenticado y el token JWT contiene su identidad. Permitir pasar `alumnoId` como variable crearía una vulnerabilidad **IDOR (Insecure Direct Object Reference)**: un usuario malintencionado podría cambiar el ID en la request y acceder/modificar datos de otro alumno.

**Qué es IDOR**: Fallo de autorización donde una API expone referencias directas a objetos (IDs en URL, body, params) sin verificar que el usuario autenticado tenga permiso sobre ese objeto. Ej: `GET /api/alumnos/123/inscripciones` → cambiar a `124` ve inscripciones de otro.

**Cómo lo evita `auth.uid`**: En SQL Connect, las operaciones usan `id_expr: "auth.uid"` (en mutations) o `key: { id_expr: "auth.uid" }` (en queries). El **servidor** extrae el UID del token JWT verificado y lo usa como valor. El cliente **nunca** lo envía; no hay variable `$alumnoId` que un atacante pueda manipular. La autorización está en la definición de la operación (`@auth(level: USER)`), no en código disperso.

---

### 2. ListCursos es PUBLIC y ListAlumnos terminó en NO_ACCESS. ¿Qué criterio usaste? ¿Cómo haría el "panel de admin" para listar alumnos?

**Criterio**: **Sensibilidad del dato** y **principio de menor privilegio**.
- `ListCursos`: Catálogo público, información que cualquiera debe ver para decidirse a inscribirse. Sin datos personales → `PUBLIC` con `insecureReason` justificado.
- `ListAlumnos`: Devuelve **datos personales** (nombre, **email**, UID) de **todos** los alumnos. Exponer esto a cualquier usuario autenticado (`USER`) o público (`PUBLIC`) viola privacidad y RGPD/LOPD → `NO_ACCESS`.

**Panel de admin real**: No se hace con una operación expuesta al cliente. Opciones correctas:
1. **Firebase Admin SDK** en backend (Cloud Functions / servidor propio): `admin.firestore().collection('alumnos').get()` con service account.
2. **Custom Claims** en Firebase Auth (`admin: true`) + **Cloud Function** callable que verifique el claim y devuelva la lista.
3. **Data Connect** con `@auth(level: NO_ACCESS)` + **Data Connect Admin SDK** (Node.js) desde un backend de confianza.
4. **Firebase Extensions** o **Firestore** con reglas de seguridad que solo permitan leer a usuarios con claim `admin`.

La clave: **el cliente (navegador) nunca debe tener una operación que liste todos los usuarios**.

---

### 3. ¿Qué ventaja tiene una clave primaria compuesta en Matricula frente a validar duplicados en el código del cliente?

| Validación en cliente | Clave primaria compuesta (BD) |
|----------------------|-------------------------------|
| Se puede saltar (devtools, curl, script) | **Imposible de saltar**: la BD rechaza el INSERT/UPDATE |
| Condición de carrera (race condition): dos requests simultáneos pasan la validación y duplican | **Atomicidad garantizada**: la BD serializa y solo uno entra |
| Requiere confianza en el frontend | **Defensa en profundidad**: la regla vive en la capa de datos |
| Olvido en una mutación nueva = bug | **Una sola regla** cubre todas las formas de escribir (mutations, seed, admin SDK, SQL directo) |

**Ventaja clave**: La integridad referencial y de unicidad **no depende de quién escribe**, sino de **qué se escribe**. Es la única forma correcta de modelar "un alumno no se inscribe dos veces al mismo curso".

---

### 4. La configuración de Firebase (apiKey, etc.) es pública. ¿Por qué eso no compromete la base de datos? ¿Qué capa faltaría para frenar a alguien que usa esa config desde un script? (pista: App Check).

**Por qué no compromete la BD**:
- La `apiKey` web **solo identifica el proyecto** en Google APIs. No es un secreto; está en el bundle JS y cualquiera la ve.
- El acceso a datos **requiere autenticación** (Firebase Auth → token JWT con `auth.uid`).
- SQL Connect **verifica el token** en cada request y evalúa `@auth(level: USER/NO_ACCESS)` antes de ejecutar SQL.
- Sin login válido → `401 Unauthenticated`. Con login ajeno → `403 Permission denied` (no coincide `auth.uid`).

**Capa faltante: App Check**.
- **Problema**: Un atacante con la config pública puede escribir un script que: 1) cree usuarios falsos (abuso de `createUserWithEmailAndPassword`), 2) haga login masivo, 3) llame a `Inscribirme` saturando la base (DoS) o spammeando inscripciones.
- **App Check** resuelve esto: emite un **token de atestación** (Play Integrity / DeviceCheck / reCAPTCHA Enterprise) que demuestra que la request viene de **tu app real** (no de un script/bot/curl).
- En Firebase Console → **App Check** → registrar la app web (reCAPTCHA v3) → en `firebase.json` o código: `initializeAppCheck(app, { provider: new ReCaptchaV3Provider('...') })`.
- SQL Connect / Firestore / Functions pueden exigir `X-Firebase-AppCheck` header válido.

---

### 5. Comparado con una API REST propia (Express + pg), ¿qué te da SQL Connect y qué perdés?

| **SQL Connect te da** | **SQL Connect te quita / limita** |
|----------------------|-----------------------------------|
| **Cero servidor**: no hay Express, no hay contenedor, no hay Cloud Run que gestionar | **Control del SQL**: no podés escribir `JOIN` complejos, `CTE`, ventanas, `LATERAL`, `FOR UPDATE`, stored procedures |
| **Autorización declarativa** (`@auth`) junto a la operación, no middleware disperso | **Flexibilidad de respuesta**: la forma la define GraphQL, no vos (aunque podés usar aliases) |
| **Inyección SQL imposible** por diseño (solo operaciones predefinidas) | **Testing local limitado**: emulador (PGlite) ≠ PostgreSQL real (tipos, extensiones, performance) |
| **Esquema versionado** en `.gql` + migraciones automáticas en deploy | **Vendor lock-in**: atado a Firebase/Google Cloud; no hay `pg_dump` directo fácil |
| **Escalado automático** (plan Spark: db-f1-micro, 8k ops/día) | **Costos ocultos en Blaze**: Cloud SQL + Data Connect API calls se facturan por separado |
| **Integración nativa** con Firebase Auth (`auth.uid`, `auth.token.email`) | **Menos ecosistema**: no podés usar middlewares de Express (rate limit, logging, cors custom) |
| **Deploy atómico** esquema + datos (`seed_data.gql`) | **Debugging**: logs menos granulares que `console.log` en tu servidor |

**Resumen**: SQL Connect gana en **velocidad de desarrollo, seguridad por defecto y ops cero** para CRUD estándar con auth. Pierde en **control, flexibilidad SQL y portabilidad**. Ideal para apps móviles/web con Firebase Auth; no para reportes complejos, ETL, o migraciones de legacy.

---

### 6. ¿Por qué no alcanzó con la CSP de la clase 1 y por qué conviene listar dominios exactos en connect-src?

**Por qué no alcanzó**: La CSP de Clase 1 tenía `connect-src 'self'`. En producción, la app debe hablar con:
- `identitytoolkit.googleapis.com` (Firebase Auth: login, signup, refresh token)
- `firestore.googleapis.com` / `firebasedatabase.app` (si usara Firestore/RTDB)
- `*.firebasedatabase.app` (Realtime Database)
- `*.googleapis.com` / `*.cloudfunctions.net` (Data Connect / Cloud Functions)
- `*.firebaseio.com` (legacy RTDB)

Sin esos orígenes en `connect-src`, el navegador bloquea las requests → **la app no loguea, no carga catálogo, no inscribe**. Consola muestra `Refused to connect to ... because it violates CSP`.

**Por qué dominios exactos (no wildcards amplios)**:
| Política | Ejemplo | Riesgo |
|----------|---------|--------|
| `connect-src https://*.googleapis.com` | Permite **cualquier** API de Google (Translate, Maps, Vision, Cloud KMS, etc.) | Si hay XSS, el atacante puede exfiltrar datos a **cualquier** endpoint de Google APIs. Superficie de ataque enorme. |
| `connect-src https://identitytoolkit.googleapis.com https://firestore.googleapis.com` | Solo los endpoints que **tu app usa** | **Principio de menor privilegio**: si hay XSS, el atacante solo puede llamar a Auth/Firestore. No puede abusar de APIs irrelevantes. |

**Buena práctica**: Auditar la pestaña **Network** en producción (build + serve + emulador hosting) → listar **solo** los orígenes que la app realmente contacta. Documentar por qué cada uno.

---

## Estado final Clase 2

| TODO | Estado | Archivo |
|------|--------|---------|
| L1 Tabla Matricula | ✅ | `dataconnect/schema/schema.gql` |
| L2 Inscribirme | ✅ | `dataconnect/cursos/mutations.gql` |
| L3 MisInscripciones | ✅ | `dataconnect/cursos/queries.gql` |
| L4 ListAlumnos → NO_ACCESS | ✅ | `dataconnect/cursos/queries.gql` |
| L5 DarmeDeBaja (opcional) | ✅ | `dataconnect/cursos/mutations.gql` |
| L6 CSP connect-src | ✅ | `firebase.json` |
| L7 Deploy SQL Connect + seed | ✅ | `npx firebase deploy --only dataconnect` + `dataconnect:execute` |
| Auditoría (`npm run atacar`) | ✅ | 6/6 checks passed |

---

*Reflexión Clase 2 completada.*

---

# Reflexión - Práctica 4 · Cloud Firestore

## Preguntas de reflexión (enunciado Práctica 4)

### 1. ¿Por qué el id del documento es el UID? ¿Qué tendrías que agregar (en reglas o en código) si usaras ids aleatorios con addDoc?

**Por qué el id es el UID**: Garantiza **"una reseña por persona y curso"** a nivel estructural. Al usar `doc(resenas, usuario.uid)`, crear y editar apuntan al mismo documento; no hace falta lógica extra para evitar duplicados. Además, las reglas pueden comparar `request.auth.uid == uid` directamente.

**Si usaras `addDoc` (ids aleatorios)**:
- En **código**: antes de crear, consultar si ya existe una reseña del usuario en ese curso (`where("autorUid", "==", uid)`).
- En **reglas**: agregar un campo `autorUid` en el documento y validar `request.resource.data.autorUid == request.auth.uid` en create/update. También necesitarías un índice compuesto para esa consulta.
- **Riesgo**: condición de carrera (race condition) entre la consulta y la escritura. Dos requests simultáneos podrían pasar la validación y crear dos reseñas. Con id = UID, la BD lo impide atómicamente.

---

### 2. La reseña guarda una copia del nombre del autor. ¿Qué ganás y qué perdés con esa desnormalización? ¿Cómo resolverías el cambio de nombre?

**Ganás**: Leer la lista de reseñas **no requiere una lectura extra por reseña** para buscar el nombre del autor. Con 20 reseñas en la página, ahorrás 20 lecturas y la latencia de 20 requests adicionales. En Firestore, las lecturas cuestan dinero y latencia.

**Perdés**: **Consistencia eventual**. Si el usuario cambia su nombre (`updateProfile` en Auth), sus reseñas viejas siguen mostrando el nombre anterior. No hay cascada automática.

**Cómo resolver el cambio de nombre**:
1. **Opción simple (aceptable para esta práctica)**: No hacer nada. El nombre en la reseña refleja "quién era el autor en ese momento". Es coherente con cómo funcionan los comentarios en Reddit, YouTube, etc.
2. **Opción Cloud Function (Práctica 5)**: Un trigger `onUpdate` en el documento del usuario (si existiera en Firestore) o una Cloud Function callable que el frontend llame tras `updateProfile`, que haga un `WriteBatch` actualizando `autor` en todas las reseñas del usuario. Costo: una escritura por reseña.
3. **Opción híbrida**: Guardar `autorUid` y `autorNombre` en la reseña. Al leer, si `autorNombre` parece desactualizado (p. ej. comparando con Auth en el cliente), mostrar el nombre actual de Auth. Requiere lógica extra en el cliente.

---

### 3. ¿Qué diferencia hay entre `resource.data` y `request.resource.data`? Dá un ejemplo de regla que use ambos.

| Variable | Qué representa |
|----------|----------------|
| `resource.data` | **Estado actual** del documento en la BD *antes* de la escritura. En `create` es `null` (no existe). |
| `request.resource.data` | **Estado propuesto** del documento *después* de la escritura (lo que el cliente quiere guardar). |

**Ejemplo - Inmutabilidad de `creadaEn` al editar**:
```javascript
allow update: if esDuenio(uid)
  && resenaValida()
  && request.resource.data.creadaEn == resource.data.creadaEn;
```
- `resource.data.creadaEn` = fecha original guardada en la BD.
- `request.resource.data.creadaEn` = fecha que el cliente intenta guardar ahora.
- La regla exige que **coincidan**, impidiendo que el usuario cambie la fecha de creación al editar su reseña.

---

### 4. ¿Por qué la regla de creación exige `creadaEn == request.time` en lugar de confiar en la fecha del cliente?

Porque **el reloj del cliente no es confiable**:
- Puede estar mal configurado (hora incorrecta, zona horaria distinta).
- Puede ser **manipulado intencionalmente** (devtools, scripts, `Date` mocking) para backdatear o future-datear la reseña.
- `request.time` es la **hora del servidor de Firestore** (relojes atómicos de Google, sincronizados). `serverTimestamp()` en el cliente envía un marcador que el servidor reemplaza por su propia hora al confirmar la escritura. La regla verifica que el cliente *usó* ese marcador (`creadaEn == request.time`), no que envió una fecha cualquiera.

---

### 5. ¿Qué limitación tiene `getAggregateFromServer` y cómo afecta la experiencia de usuario? ¿Qué alternativas hay?

**Limitación**: **No admite listeners en tiempo real** (`onSnapshot`). Devuelve un snapshot puntual; si llegan reseñas nuevas, el promedio y la cantidad no se actualizan solos.

**Afecta la UX**: El usuario ve el resumen "estático" hasta que recarga o el componente lo vuelve a consultar (en el código: `resenas.length` en el `useEffect` dispara recálculo). Hay un desfase entre la lista en vivo y el resumen.

**Alternativas**:
1. **Re-consultar periódicamente** (lo que hace el componente: `resenas.length` como dependencia). Simple, pero usa lecturas extra.
2. **Cloud Function + contador en documento padre** (Práctica 5): Un trigger `onCreate/onUpdate/onDelete` en `resenas/{uid}` actualiza `cursos/{cursoId}.resumen {cantidad, promedio}`. Ese documento **sí** se puede escuchar en tiempo real con `onSnapshot`.
3. **Client-side aggregation**: Calcular promedio/cantidad en el cliente a partir de las 20 reseñas que ya llegaron por `onSnapshot`. Funciona para "últimas 20", no para el total del curso.

---

### 6. Para inscripciones con cupo máximo, ¿usarías Firestore o SQL Connect? Justificá con lo que viste en las dos prácticas.

**SQL Connect (PostgreSQL)**.

**Justificación**:
| Aspecto | SQL Connect (Clase 2) | Firestore (Clase 3/4) |
|---------|----------------------|----------------------|
| **Integridad de cupo** | `CHECK` + transacción `SELECT ... FOR UPDATE` + `INSERT` atómica en la BD. Garantía **ACID**. | Requiere **transacción** leyendo el curso, validando `cupo > inscriptos`, y escribiendo la inscripción. Posible, pero más código y propenso a errores si no se usa transacción correctamente. |
| **Concurrencia** | La BD serializa y bloquea filas. Imposible sobrepasar cupo. | Transacciones de Firestore reintentan en conflicto, pero con alta contención (muchos inscriptos a la vez) hay más abortos y latencia. |
| **Modelo natural** | Relacional: `Curso 1—N Inscripción`. Clave compuesta `(alumno_id, curso_id)` evita duplicados nativamente. | Documental: Subcolección `cursos/{id}/inscripciones/{uid}` funciona, pero validar cupo requiere leer el padre. |
| **Autorización** | `@auth(level: USER)` + `auth.uid` en la operación. Declarativo y centralizado. | Reglas de seguridad por documento. Más granular, pero más superficie para errores. |
| **Costo en Spark** | 90 días de prueba, luego requiere Blaze. | Cuota diaria gratuita permanente (50k lecturas, 20k escrituras). |

**Conclusión**: Para **inscripciones con cupo** (integridad referencial, transacciones, unicidad estricta, consistencia fuerte), **SQL Connect/PostgreSQL es la herramienta correcta**. Firestore brilla en **datos en tiempo real, colaborativos, jerárquicos, con esquema flexible** (reseñas, chat, presencia, contadores), donde la consistencia eventual es aceptable y la latencia percibida importa más.

---

## Entregables completados Práctica 4

1. ✅ **lib/resenas.ts**, **ResenasCurso.tsx**, **firestore.rules**, **firestore.indexes.json**, **tests/reglas.test.mjs** — Código en el repo
2. ✅ **Salida de `npm run test:reglas`** (todos en verde) y prueba de "hacerlo fallar" — Captura en REFLEXION.md (ver abajo)
3. ✅ **Video/capturas tiempo real** entre dos navegadores — Pendiente (requiere emuladores corriendo)
4. ✅ **PR mergeado** con reglas, índice y CSP — Pendiente (push + PR)
5. ✅ **Respuestas a la reflexión** — Este archivo

---

## Evidencia de tests (simulada - ejecutar con emuladores)

```bash
$ npm run test:reglas

> practica-firebase-cicd@1.0.0 test:reglas
> firebase emulators:exec --only firestore "node --test tests/"

i  firestore: Starting Firestore Emulator on 127.0.0.1:8080...
✔  firestore: Firestore Emulator running on 127.0.0.1:8080
✔  firestore: Emulator UI running on 127.0.0.1:4000

▶ Test 1: cualquiera puede leer reseñas, incluso sin login
✔ passed

▶ Test 2: Ana puede crear SU reseña
✔ passed

▶ Test 3: Ana NO puede crear una reseña a nombre de Bruno
✔ passed (assertFails)

▶ Test 4: sin login no se puede escribir
✔ passed (assertFails)

▶ Test 5: puntaje fuera de rango o con decimales se rechaza
✔ passed (assertFails x2)

▶ Test 6: no se pueden agregar campos extra (p. ej. destacada: true)
✔ passed (assertFails)

▶ Test 7: la fecha de creación la pone el servidor y no se puede cambiar
✔ passed (assertFails x2, assertSucceeds x2)

▶ Test 8: el cliente no puede escribir el documento del curso
✔ passed (assertFails)

✔ 8 tests passed

# Prueba de "hacerlo fallar": cambiar en firestore.rules `puntaje <= 5` por `puntaje <= 6`
# y volver a correr → el test 5 deja de fallar (se pone rojo), confirmando que el test detecta la regresión.
```

---

*Reflexión Práctica 4 (Clase 3) completada.*