# Conjugarnos

Una biblioteca viva: un grupo de amigos junta textos (cuentos, poemas, letras) que le quedan bien a **un planeta o a una pareja de planetas**, y los valida votando. Es la versión compartida de la pestaña «Combinar» de la carta natal, pero es una app aparte: no guarda datos de nacimiento ni cartas.

- **55 combinaciones**: las 45 parejas de planetas y los 10 planetas solos. Sin signos, casas ni aspectos.
- **Un texto** lleva título, autor y hasta **2000 palabras** (un cuento corto entra).
- **Se vota** a favor o en contra (en contra pide un motivo de una línea). Con **4 votos a favor y al menos 2/3 a favor** el texto queda *validado*; si baja de la mitad a favor, vuelve a *en debate*. El grupo puede ajustar el umbral.
- **En vivo**: si alguien propone o vota, a los demás les aparece al instante, sin recargar.
- **Sin contraseñas**: se entra con un link de invitación y un nombre. El dispositivo queda como «vos»; en *Grupo* hay un «link para volver» para entrar desde otro.

## Cómo está hecho

| Parte | Qué es |
|---|---|
| `static/` | La página: JavaScript sin framework (módulos ES), misma estética que la carta. Se publica tal cual, sin compilar. |
| `supabase/schema.sql` | La base (Postgres). **Toda la seguridad está acá**: las tablas están cerradas y solo se entra por funciones que verifican quién sos. |
| `dev/server.mjs` | Un servidor para probar en tu compu, con la misma base (PGlite = Postgres de verdad) y avisos en vivo. No hace falta Supabase para probar. |
| `test/` | Pruebas de la base (24), del tiempo real (5) y de punta a punta con varias personas (`test/e2e/`, Python + Playwright). |
| `.github/workflows/mantener-despierta.yml` | Llama a la base una vez por día para que Supabase gratis no la pause. |

**Seguridad, en criollo.** No hay mails ni contraseñas. Tu navegador genera una clave personal al azar y la base solo guarda su huella (sha256). Cada función de la base recibe esa clave, sabe quién sos y a qué grupo pertenecés, y solo muestra o cambia lo de tu grupo. Las claves que van en `static/config.js` (URL y clave *publishable*) son públicas por diseño: no dan acceso a nada que las funciones no permitan. **Nunca** pongas ahí la clave `secret` o `service_role`.

## Probarlo en tu compu

Hace falta Node 20 o más nuevo.

```bash
npm install
npm run dev
```

Imprime dos links: uno de **admin** (sirve una sola vez) y uno de **invitación**. Abrí el de admin en una ventana, el de invitación en otra (mejor en una ventana privada, o en otro navegador, para tener dos personas) y probá proponer, votar y ver los cambios en vivo. Por defecto la base vive en memoria; con `node dev/server.mjs --datos dev/datos` los datos quedan guardados.

## Publicarlo para el grupo de amigos (paso a paso)

Todo gratis, sin servidor propio. Son unos 15 minutos.

**1. Crear la base en Supabase**
1. Entrá a [supabase.com](https://supabase.com), creá una cuenta y un proyecto nuevo. Elegí una región cercana (para Buenos Aires, *South America (São Paulo)*).
2. En el proyecto: **SQL Editor → New query**, pegá todo `supabase/schema.sql` y apretá **Run**. Se puede volver a correr sin romper nada.
3. **Crear el grupo de amigos.** El paso anterior dejó la base lista pero vacía: todavía no existe ningún grupo. Se crea una sola vez, con una orden de una línea:
   1. En el SQL Editor abrí una consulta nueva (el botón **+** al lado de las pestañas), o en la misma pestaña borrá todo con Cmd/Ctrl+A y Supr. No dejes el archivo entero ahí: *Run* correría todo de nuevo.
   2. Pegá esta línea, cambiando el nombre entre comillas por el de tu grupo:
      ```sql
      select crear_grupo('Mi grupo');
      ```
   3. Apretá **Run** (o Cmd/Ctrl+Enter). Abajo, en *Results*, aparece una fila con un texto como `{"id": "…", "codigo": "…", "codigo_admin": "…"}`. Hacé clic en la celda para verlo entero y **copiá `codigo` y `codigo_admin` a un lugar seguro** (un archivo de notas, por ejemplo): `codigo` es la invitación para tus amigos y `codigo_admin` es solo tuyo y se usa una vez, en el paso 4.
   
   Corrélo una sola vez (cada vez que se corre crea un grupo nuevo). Esta función solo se puede ejecutar desde el SQL Editor: nadie más puede crear grupos.
4. En **Project Settings → API Keys** (o el botón *Connect*) copiá la **URL del proyecto** y la clave **publishable** (`sb_publishable_…`; en proyectos viejos puede llamarse `anon`).

**2. Poner esos datos en la página**
Editá `static/config.js`:
```js
window.CONJUGARNOS = { url: "https://TU-PROYECTO.supabase.co", clave_publica: "sb_publishable_…" };
```

**3. Publicar la carpeta `static/`**
Sirve cualquier hosting de sitios estáticos. Por ejemplo, en **Render → New → Static Site**, o Cloudflare Pages, Netlify o GitHub Pages: apuntá al repositorio, *Publish directory* = `static`, sin comando de build. (Un sitio estático no se duerme.)

**4. Entrar**
Abrí `https://TU-SITIO/#entrar/CODIGO_ADMIN` con el `codigo_admin` del paso 1.3, elegí tu nombre y listo: quedás como admin (ese link sirve una sola vez). En **Grupo** aparece el **link de invitación** para mandarle a tus amigos.

**5. Que Supabase no pause la base**
El plan gratis pausa los proyectos con poca actividad. Este repositorio trae un aviso diario: en GitHub, **Settings → Secrets and variables → Actions**, creá `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` (los mismos valores de `config.js`). El flujo corre solo; podés probarlo a mano desde la pestaña *Actions → Mantener despierta la base → Run workflow*. (GitHub desactiva los flujos programados si el repositorio pasa 60 días sin actividad.) Si la base se pausara igual, se reactiva con un botón en el panel de Supabase.

**6. Copia de seguridad**
En **Grupo → Copia de seguridad** el admin descarga todo (miembros, textos y votos) en un JSON. Conviene hacerlo de vez en cuando.

## Reglas de partida (a probar con el grupo)

- Se valida con 4 votos a favor y al menos 2/3 a favor (el admin lo ajusta en *Grupo*).
- Quien propone ya vota a favor. Un texto validado vuelve a «en debate» si baja de la mitad a favor.
- Editar un texto: cambiar el cuerpo reinicia los votos; corregir una errata (hasta 3 palabras, o el 2 %) no.
- Cualquiera puede pedir que se retire un texto; el admin decide. El admin también puede borrar y expulsar.
- Un texto puede estar en varias combinaciones y cada una se vota por separado.
- Un planeta solo muestra sus propios textos y, debajo, las parejas donde aparece.

**Derechos de autor.** La app no pide fuente: el tope de palabras ayuda, pero no vuelve libre una obra con derechos subida completa, y sin fuente cuesta más saber de dónde salió cada texto. En un grupo privado de amigos el riesgo es bajo; si algún día hay un grupo global, conviene una regla más estricta (obras de dominio público completas, fragmentos cortos de las vigentes). Esto no es asesoramiento legal.

## Pruebas

```bash
npm test                      # la base (24 pruebas, Postgres real) y el cliente de tiempo real (5)
npm run dev                   # en otra terminal, para las de punta a punta:
python3 test/e2e/1_cuatro_personas_en_vivo.py
python3 test/e2e/2_editar_retiro_exportar_expulsar.py
python3 test/e2e/3_casos_borde.py
python3 test/e2e/4_camino_de_produccion.py   # todas necesitan Playwright para Python: pip install playwright && playwright install chromium
```

Lo que **no** se pudo probar sin un proyecto de Supabase real: el tiempo real contra el servicio de verdad (se probó, en un navegador, contra el servidor de desarrollo, que habla el mismo protocolo de Realtime por WebSocket: la prueba 4 usa el cliente empaquetado igual que en producción) y las políticas de permisos de Supabase (se probaron en un Postgres con los mismos roles). Por eso la primera vez conviene mirar en *Grupo* la línea «Conectado: los cambios aparecen al instante». Si dice que el tiempo real no está conectado, la app igual funciona: busca los cambios cada 45 segundos y al volver a la pestaña.

## Más adelante (etapa 2, sin decidir del todo)

Varios grupos y un grupo global: lo que gana en un grupo entra directo al global, sin otra votación, y solo lo suma el admin del global (los miembros no lo envían, quizás más adelante). Hoy cada clave personal pertenece a un solo grupo.
