# VetCloud Backend

API REST profesional del sistema veterinario multi-tenant, en Node.js + Express + PostgreSQL, ya conectada a tu esquema en Supabase (proyecto `ygerovhafvfpzygerdew`, 54 tablas con Row Level Security activo).

## 1. Instalación

```bash
cd backend
npm install
cp .env.example .env
```

Edita `.env` y completa `DATABASE_URL` con tu contraseña real de Postgres:
- Ve a **Supabase → Project Settings → Database → Connection string (URI)**.
- El host ya es `db.ygerovhafvfpzygerdew.supabase.co` (tu proyecto).
- Genera también un `JWT_SECRET` largo y aleatorio (ej. `openssl rand -hex 32`).

## 2. Crear el primer tenant + usuario admin

Las tablas ya existen en Supabase, pero están vacías (excepto roles y formas de pago). Antes de poder hacer login necesitas al menos una clínica y un usuario. Ejecuta esto una vez en el SQL Editor de Supabase (reemplaza los valores):

```sql
INSERT INTO tenants (nombre_comercial, razon_social, ruc, email)
VALUES ('Clínica San Rafael', 'Veterinaria San Rafael S.A.', '1790000000001', 'contacto@sanrafael.com')
RETURNING id;
-- usa el id devuelto abajo

INSERT INTO usuarios (tenant_id, rol_id, nombres, apellidos, email, password_hash)
VALUES (
  1, -- id del tenant creado arriba
  (SELECT id FROM roles WHERE nombre = 'admin'),
  'María', 'Salazar', 'admin@sanrafael.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMy.MHqPKnCX/6C9Y1CGyLiZlPu6bKq5F6a' -- hash de "cambia123", ver abajo
);
```

Para generar el `password_hash` real de la contraseña que quieras, corre en tu máquina:
```bash
node -e "console.log(require('bcryptjs').hashSync('cambia123', 10))"
```

## 3. Levantar el servidor

```bash
npm run dev     # con recarga automática
# o
npm start
```

Prueba:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sanrafael.com","password":"cambia123"}'
```

Con el `token` que devuelve, todas las demás rutas van con:
```
Authorization: Bearer <token>
```

## 4. Cómo funciona el aislamiento multi-tenant

Cada request autenticado abre una transacción y ejecuta `SET LOCAL app.current_tenant_id`
con el `tenant_id` del token (`src/middleware/tenant.middleware.js`). A partir de ahí,
ninguna query necesita `WHERE tenant_id = ...`: las políticas RLS que ya están activas
en Supabase filtran automáticamente. Esto es intencional — es defensa en profundidad:
aunque una ruta tenga un bug y se le olvide un filtro, la base de datos protege igual.

## 5. Estructura del proyecto

```
src/
  config/db.js              → pool de conexión a Postgres (Supabase)
  middleware/
    auth.middleware.js       → valida JWT
    tenant.middleware.js     → SET LOCAL app.current_tenant_id (RLS)
    roles.middleware.js      → requireRole('admin', 'doctor', ...)
    errorHandler.middleware.js
  utils/
    crudFactory.js           → genera CRUD estándar para recursos simples
    historial.js             → registra eventos en historial_eventos_mascota
    helpers.js                → asyncHandler, paginación
  routes/
    auth.routes.js            → login, me, refresh
    clientes.routes.js
    mascotas.routes.js         → incluye /:id/historial (línea de tiempo unificada)
    citas.routes.js            → incluye /hoy, /proximas
    consultas.routes.js        → registra automáticamente en el historial
    inventario.routes.js       → productos, /stock-bajo, movimientos
    proformas.routes.js        → crear → aprobar/rechazar → /facturar
    facturas.routes.js         → pagos, anulación, cuentas por cobrar
    caja.routes.js             → apertura/cierre + caja chica
    dashboard.routes.js        → /kpis, /mascotas-atendidas, /alertas, /carga-doctores
```

## 6. Endpoints implementados

Cobertura completa de: autenticación, clientes, mascotas (+ historial unificado e
historia clínica), citas, consultas médicas (con aplicación de tratamientos),
inventario (con control de stock), proformas → facturación (flujo completo con
transacciones), pagos y cuentas por cobrar, caja y caja chica, y todas las
estadísticas del dashboard.

Para módulos no incluidos todavía como rutas propias (vacunas, exámenes de
laboratorio, cirugías, hospitalizaciones, compras, contabilidad general, usuarios
y roles), usa `crudRouter()` de `src/utils/crudFactory.js` — el mismo patrón usado
en `clientes.routes.js` / `mascotas.routes.js` / `inventario.routes.js` — para
generarlos en minutos. El detalle completo de cada endpoint (método, ruta, roles
permitidos) está en `api_endpoints.md`.

## 7. Despliegue

Funciona en cualquier hosting Node.js (Railway, Render, Fly.io, un VPS con PM2, etc.).
Variables de entorno mínimas: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`
(la URL de tu frontend en producción).

Para producción, crea el rol dedicado de Postgres en vez de usar `postgres`
(ver la sección "ROL DE APLICACIÓN" al final de `schema_completo_supabase.sql`)
y usa ese connection string en `DATABASE_URL`.
