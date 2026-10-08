# Sales Coworker · Primera Línea Farmaenlace

[Repositorio](https://github.com/sevaco14/farmaenlaceHT) · [Demo AWS](https://d3d0kckkr3hkmr.cloudfront.net) · [Verificación de entrega](docs/VERIFICACION_AWS.md)

**De señales operativas dispersas a una decisión concreta, antes de perder el stock y la venta.**

Prototipo para la hackathon Connect AI Build: un analista comercial que cruza consultas de clientes, inventario y promociones para ayudar al encargado comercial o jefe de zona de Farmaenlace. Tres agentes especializados consultan evidencia y el sistema presenta una propuesta que una persona puede aprobar o rechazar.

**Equipo: Orito.**

## Problema

La demanda aparece en las consultas de clientes, el stock vive en el inventario y las oportunidades comerciales dependen del catálogo y las promociones. Cuando estas señales se revisan por separado, el encargado puede detectar tarde una oportunidad de reabastecimiento o una posible falta de producto.

El reto es transformar esos datos en una acción comprensible: **qué producto atender, en qué ciudad, cuántas unidades reponer y si corresponde activar una promoción local**.

## Solución

Primera Línea reúne las señales de una zona y muestra la evidencia detrás de cada propuesta:

| Agente | Evidencia que consulta | Aporte a la decisión |
| --- | --- | --- |
| WhatsApp | Consultas agregadas, muestras de mensajes y contexto del producto | Identificar cambios en la demanda |
| Inventario | Existencias, objetivo de stock y sucursales con menor cobertura | Detectar necesidad de reposición |
| Catálogo y promociones | Producto y calendario de promociones | Comprobar si existe una promoción aplicable |

El análisis usa Amazon Bedrock con herramientas limitadas a la ciudad y al producto seleccionados. Las propuestas incluyen cantidades y duración cuando corresponda. **La aprobación humana es necesaria para aplicar la acción en la simulación.**

## Qué incluye el prototipo

- Tablero por ciudad: Guayaquil, Quito y Cuenca.
- Análisis bajo demanda con tres agentes de Bedrock y explicación de sus resultados.
- Órdenes con estados pendiente, aprobada, rechazada, vencida o reemplazada por un cambio del escenario.
- Aprobación o rechazo con registro del actor y el momento de la decisión.
- Actualización del inventario y de la promoción en el escenario simulado al aprobar una orden válida.
- Simulación de consultas, stock y promociones, con controles de pausa, avance y velocidad.
- Maqueta 3D de una sucursal y actualización reactiva del tablero.
- Generador e importador de datos operativos sintéticos.

La interfaz distingue las propuestas obtenidas por reglas de demostración de las generadas a partir del análisis de Bedrock. Si el análisis de Bedrock falla, informa el error y no guarda una recomendación de ese análisis. Un inventario completo nunca genera una reposición, aunque el modelo indique un nivel incorrecto: las cantidades salen del inventario numérico.

## Demo

**Demo disponible: [d3d0kckkr3hkmr.cloudfront.net](https://d3d0kckkr3hkmr.cloudfront.net).** Frontend, backend self-hosted e integración real con Bedrock verificados en AWS el 8 de octubre de 2026. El alojamiento depende de la vigencia de la cuenta temporal del workshop.

Recorrido sugerido para presentar el proyecto:

1. Seleccionar una ciudad y observar las señales del producto.
2. Pulsar **Analizar con Bedrock** para consultar a los tres agentes.
3. Revisar la evidencia y la orden propuesta, si las condiciones justifican una acción.
4. Aprobar o rechazar la orden.
5. Mostrar el resultado registrado y, al aprobar, el cambio en el escenario simulado.

Los valores y las propuestas pueden cambiar conforme avanza la simulación. Para un recorrido estable, pausar la simulación antes de analizar. Si el stock todavía es suficiente, no crear una orden es el resultado correcto; avanzar el escenario para observar una condición de reposición. Las órdenes vencen a los 15 minutos. Una propuesta vencida o desactualizada requiere un nuevo análisis.

## Arquitectura y tecnologías

La arquitectura de entrega conserva Convex y aloja sus servicios en AWS. **No requiere Convex Cloud**: la base de datos, las consultas, las mutaciones, los temporizadores y las acciones Node se ejecutan en el backend Convex autogestionado.

```text
Navegador
   │ HTTPS / WebSocket
CloudFront
   │
Application Load Balancer
   │
Una instancia EC2
   ├─ Nginx: exportación estática Next.js y proxy /api/
   └─ Convex self-hosted: datos, funciones y agentes
         ├─ Volumen persistente: datos sintéticos y decisiones
         └─ Rol IAM → Amazon Bedrock, us-east-1

S3 privado → artefactos de despliegue
Systems Manager → preparación y operación de la instancia
```

`infra/docker-compose.yml` define los contenedores y el volumen del backend; `infra/nginx.conf` sirve la web y enruta HTTP/WebSocket de Convex. El navegador usa un solo origen HTTPS. S3 almacena los artefactos con acceso público bloqueado; no necesita un bucket público para servir la aplicación. El acceso al servidor se administra con Systems Manager y el grupo de seguridad limita el tráfico de aplicación al balanceador.

| Capa | Tecnología |
| --- | --- |
| Aplicación web | Next.js 15, React 19 y TypeScript |
| Backend y estado reactivo | Convex self-hosted en EC2 |
| Análisis con IA | Amazon Bedrock, API Converse y herramientas por agente |
| Modelo por defecto | Amazon Nova Lite, configurable mediante `BEDROCK_MODEL_ID` |
| Visualización 3D | Three.js, React Three Fiber y Drei |
| Pruebas | Vitest y convex-test |
| Alojamiento de entrega | EC2, ALB, CloudFront y S3 privado |

Archivos principales:

- `app/page.tsx`: tablero y flujo de decisión.
- `components/branch/`: escena 3D de la sucursal.
- `convex/comercial.ts`: consulta del tablero y decisiones sobre órdenes.
- `convex/live.ts`: simulación y aplicación de decisiones.
- `convex/agents/`: instrucciones, herramientas y llamadas a Bedrock.
- `convex/agentData.ts` y `convex/agentApply.ts`: evidencia del análisis y persistencia de sus resultados.
- `scripts/`: generación e importación del conjunto sintético.
- `infra/`: contenedores y proxy del despliegue AWS.

## Ejecución local

Requisitos: Node.js 22 o superior, npm y un backend Convex autogestionado accesible. Para ejecutar el análisis con IA también se necesita acceso a Amazon Bedrock y al modelo configurado.

```powershell
git clone https://github.com/sevaco14/farmaenlaceHT.git
cd farmaenlaceHT
npm ci
Copy-Item .env.example .env.local
# Completar NEXT_PUBLIC_CONVEX_URL con el origen HTTPS del backend AWS.
npm run dev
```

Abrir `http://localhost:3000`. Este comando arranca el frontend local y utiliza el backend indicado por `NEXT_PUBLIC_CONVEX_URL`. La inicialización del escenario ocurre al abrir el tablero.

Para desarrollar el backend self-hosted, completar `CONVEX_SELF_HOSTED_URL` y `CONVEX_SELF_HOSTED_ADMIN_KEY` en `.env.local`. La clave administrativa se obtiene del backend del equipo y no se entrega al navegador. `npm run dev:backend` observa y publica cambios de funciones; `npm run backend:deploy` realiza una publicación puntual. Ambos leen `.env.local`. `npm run dev` inicia únicamente Next.js. Coordinar las publicaciones de backend cuando se utiliza la instancia compartida del equipo.

### Variables de entorno

Usar `.env.example` como referencia; no publicar credenciales.

| Variable | Dónde se configura | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Entorno de compilación / `.env.local` | Origen HTTPS del backend self-hosted; puede ser público |
| `CONVEX_SELF_HOSTED_URL` | Entorno administrativo de la CLI | URL del backend autogestionado |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Entorno administrativo de la CLI | Clave para desplegar funciones y configurar el backend |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | `.env.aws.local` del operador, si utiliza una sesión temporal del workshop | Acceso administrativo para preparar AWS y pruebas locales; no forman parte del frontend |
| `AWS_REGION` | Variables del backend Convex | Región de Bedrock; por defecto `us-east-1` |
| `BEDROCK_MODEL_ID` | Variables del backend Convex | Modelo o perfil habilitado; por defecto `amazon.nova-lite-v1:0` |
| `BEDROCK_USE_INSTANCE_ROLE=true` | Variables de las acciones Convex en EC2 | Usa el rol IAM de la instancia para invocar Bedrock sin fijar claves temporales en el servidor |

Las variables de AWS de las acciones se configuran en el backend Convex; guardarlas solo en el archivo de Next.js no configura un backend remoto. El despliegue de entrega utiliza el rol IAM de EC2 y deja que el SDK renueve sus credenciales. Para una prueba local de Bedrock sí puede utilizarse el bloque completo de credenciales temporales del workshop, incluido su token de sesión. `.env.example` separa la configuración del frontend, la CLI administrativa, el operador AWS y el servidor Docker. La autenticación de usuarios todavía no está integrada.

### Datos y comprobaciones

La simulación inicializa su escenario desde el tablero. Para regenerar el conjunto adicional de datos operativos:

```powershell
npm run data:generate
```

`npm run data:import` importa ese conjunto en el entorno de Convex seleccionado y reconstruye sus indicadores. **Este comando reemplaza las tablas de datos sintéticos que administra el importador**; utilizarlo en un entorno de demostración dedicado. Tras la importación, reiniciar el escenario desde el tablero para que las órdenes utilicen las existencias y la vigencia del mundo actual. El botón de reinicio elimina el historial de esa simulación; un análisis normal conserva las propuestas anteriores como reemplazadas.

Comandos disponibles para comprobar el proyecto:

```powershell
npm run typecheck
npm test
npm run build
```

## Verificación de la entrega

El 8 de octubre de 2026 se verificó el flujo completo contra la **URL pública AWS**, con **Amazon Nova Lite (`amazon.nova-lite-v1:0`) en `us-east-1` y el rol IAM del servidor**. Dos análisis completaron los tres agentes en 25,377 s y 22,302 s. Para Jabón antibacterial en Guayaquil, rechazar mantuvo el stock en **185/760**; una nueva propuesta aprobada añadió **575 unidades**, hasta **760/760**. Repetir ambas decisiones no duplicó sus efectos.

Un cliente nuevo y un reinicio real del contenedor del backend conservaron las decisiones y el stock final. El navegador mostró la maqueta 3D y los datos reactivos. La comprobación automatizada realizó las acciones contra el backend público; no se presenta como una prueba manual de todos los controles del navegador. [Informe y alcance de la verificación](docs/VERIFICACION_AWS.md).

**Verificación local: 38/38 pruebas pasan, TypeScript pasa y la compilación con el origen público AWS pasa.** La batería contiene 25 casos para llamadas, herramientas y validación Bedrock; 11 para decisiones y evidencia; y 2 para exclusión y espera global entre solicitudes. La prueba real de Bedrock no se ejecuta al correr `npm test`.

Se comprueban, entre otros comportamientos:

- El modelo consulta herramientas antes de concluir y solo puede usar la ciudad, el SKU y las herramientas autorizadas para su agente.
- Una salida inválida admite una única corrección; dos salidas inválidas, un timeout o credenciales vencidas detienen el análisis sin respaldo silencioso ni nueva recomendación.
- Las solicitudes comparten un control global: una invocación a la vez y una espera de 1,1 segundos después de cada respuesta, también entre sesiones.
- Aprobar dos veces modifica el inventario una sola vez; rechazar no repone ni activa promociones.
- Una orden vencida o cuyo inventario fue repuesto no se aplica; un análisis que terminó después de un reinicio o una decisión no resucita la orden anterior.
- Las métricas de la simulación indican consultas por hora; sus proyecciones de 7/21 días no se presentan como observaciones históricas.

### Relación con el README de pruebas anterior

La batería entregada del proyecto anterior evalúa un **intérprete Python** que recibe conversaciones y devuelve `status`, `sku`, `branch_id` y `document_ids`. Sus casos Q01–Q12, el catálogo `SC-001` y las rutas `tests/test_sales_*.py` no corresponden al contrato actual Next.js/Convex, cuyo catálogo usa códigos `FE-*` y cuya interfaz analiza productos seleccionados por ciudad.

Por eso, los resultados previos de **8/12 y 47/60 no son resultados de esta versión**, ni las 38 pruebas actuales equivalen a aprobar aquella batería. Se conservan sus criterios pertinentes —evidencia verificable, errores explícitos, decisión humana, vigencia e idempotencia— con pruebas del flujo actual. Esta entrega no incorpora el perfilador acumulativo de conversaciones, la comparación interanual ni los permisos viewer/manager por sucursal descritos en el sistema anterior.

## Operación en AWS

Estado: **CloudFormation `CREATE_COMPLETE`; aplicación, esquema y funciones publicados; flujo remoto verificado**. La infraestructura de entrega utiliza una instancia EC2, un ALB, CloudFront y un bucket privado para artefactos en la cuenta del workshop, con Bedrock en `us-east-1`. Se importaron las ocho tablas del conjunto sintético y se reconstruyeron 48 indicadores; los conteos constan en el [informe](docs/VERIFICACION_AWS.md).

1. Confirmar que se trabaja en la cuenta del equipo y cargar el bloque completo de credenciales temporales del workshop en el entorno del operador.
2. Consultar la pila con `scripts/deploy-aws.mjs status`; usar `create` solamente para la creación inicial. `infra/aws-stack.mjs` define la infraestructura y el script utiliza la VPC, subredes e imagen seleccionadas en la cuenta del workshop. Para otra cuenta deben actualizarse esos parámetros.
3. Después de cada publicación, comprobar `/health`, la conexión reactiva del tablero y la inicialización del escenario en la URL pública.
4. Desde la URL pública, pausar el escenario, analizar una ciudad con Bedrock, revisar las tres respuestas y aprobar una orden válida. Recargar y verificar que el estado y el inventario persisten; probar también el rechazo.
5. Si el análisis falla, revisar primero región, modelo, permiso de invocación del rol IAM y logs de las acciones. Si la web no conecta, comprobar salud del balanceador, contenedores y proxy `/api/`. Las imágenes oficiales y el volumen se definen en `infra/docker-compose.yml`.

Comandos administrativos; `RUTA_DEL_RELEASE.tar.gz` y `RUTA_DEL_SCRIPT.sh` son archivos preparados para la versión que se va a publicar:

```powershell
# Estado y outputs: URL, instancia y bucket.
node --env-file=.env.aws.local scripts/deploy-aws.mjs status

# Subir el paquete al bucket privado y ejecutar su instalación mediante SSM.
node --env-file=.env.aws.local scripts/deploy-aws.mjs upload RUTA_DEL_RELEASE.tar.gz
node --env-file=.env.aws.local scripts/deploy-aws.mjs command RUTA_DEL_SCRIPT.sh
node --env-file=.env.aws.local scripts/deploy-aws.mjs result
```

El paquete debe incluir la exportación web y la configuración de `infra/`. `scripts/bootstrap-aws.sh` descarga el paquete privado, conserva el secreto existente y arranca los contenedores; requiere `ARTIFACT_BUCKET` y `PUBLIC_ORIGIN` definidos antes de ejecutarlo mediante SSM. Publicar las funciones con `npm run backend:deploy`. `upload` solo sube el artefacto: no compila ni publica por sí mismo. `status` guarda los outputs en `.local/aws-deployment.json`. Si un comando devuelve una clave administrativa, añadir `--private-output` a `command` para guardar la salida localmente sin imprimirla. `.env.aws.local` y `.local/` no se versionan.

`npm run test:aws` ejecuta `scripts/smoke-aws.mjs`: **dos análisis reales con tres agentes cada uno**, rechazo y aprobación repetidos, inventario exacto y persistencia con un cliente nuevo. Necesita `NEXT_PUBLIC_CONVEX_URL` y `CONVEX_SELF_HOSTED_ADMIN_KEY` en `.env.local`; utiliza y modifica únicamente el escenario sintético, deja la simulación pausada y guarda el resultado en `.local/aws-smoke.json`. **La corrida del 8 de octubre de 2026 terminó correctamente**; el reinicio del backend y la carga del navegador se verificaron adicionalmente.

La instancia única es una elección de alcance para la hackathon: conserva datos en su volumen mientras el entorno exista, pero no demuestra alta disponibilidad, recuperación ante pérdida del volumen ni permanencia de la cuenta temporal. Para un piloto se requieren copias de seguridad y un entorno de operación estable.

## Alcance de la entrega

- Los datos, mensajes, movimientos de stock y efectos de las órdenes son **sintéticos**. No se utilizan datos reales de clientes, salud o pagos.
- Las llamadas a Bedrock son reales cuando se configura el acceso AWS; no equivalen a una integración con sistemas comerciales reales.
- WhatsApp, SAP, el lago de datos, Airflow y SmartClub forman parte del contexto de negocio y de una posible integración futura. Este prototipo no conecta ni ejecuta operaciones en esos sistemas.
- La autenticación no está configurada; las decisiones utilizan el actor de demostración `gerente-demo` cuando no existe identidad autenticada.
- No se presentan métricas de ahorro, ventas recuperadas o impacto productivo medido. La entrega demuestra el flujo de análisis, revisión humana y ejecución simulada.

## Cómo medir el valor en un piloto

Las siguientes son **métricas propuestas, no resultados obtenidos**: tiempo desde la detección de una señal hasta la decisión, porcentaje de propuestas aceptadas, frecuencia de quiebres de stock y ventas no atendidas por falta de producto. El piloto debería comparar una línea base con un grupo de sucursales y productos acotado, conservando la revisión humana y el registro de decisiones.

Ruta propuesta: validar las señales con encargados de zona; conectar fuentes autorizadas en modo de lectura; evaluar recomendaciones sin ejecución automática; y habilitar un flujo de aprobación integrado solo después de validar datos, permisos y resultados. La arquitectura de entrega mantiene Convex como backend autogestionado dentro de AWS.

**El sistema propone. La primera línea decide.**
