const express = require('express');
const bcrypt = require('bcryptjs');
const { asyncHandler, TENANT_TZ_SQL } = require('../utils/helpers');
const { requireSuperadmin } = require('../middleware/superadmin.middleware');

const router = express.Router();

router.use(requireSuperadmin);

// GET /superadmin/tenants — listado de clínicas con métricas rápidas
router.get(
  '/tenants',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(`
      SELECT
        t.id, t.nombre_comercial, t.razon_social, t.ruc, t.ciudad, t.provincia,
        t.telefono, t.email, t.timezone, t.plan_suscripcion, t.estado, t.fecha_registro,
        (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id AND u.estado = 'activo') AS usuarios_activos,
        (SELECT COUNT(*) FROM empleados e WHERE e.tenant_id = t.id AND e.tipo_empleado = 'doctor' AND e.estado = 'activo') AS doctores,
        (SELECT COUNT(*) FROM empleados e WHERE e.tenant_id = t.id AND e.tipo_empleado != 'doctor' AND e.estado = 'activo') AS asistentes,
        (SELECT COUNT(*) FROM clientes c WHERE c.tenant_id = t.id) AS clientes,
        (SELECT COUNT(*) FROM mascotas m WHERE m.tenant_id = t.id) AS mascotas,
        (SELECT COUNT(*) FROM citas c WHERE c.tenant_id = t.id
           AND c.fecha_hora::date = (NOW() AT TIME ZONE COALESCE(t.timezone, 'America/Guayaquil'))::date
        ) AS citas_hoy
      FROM tenants t
      ORDER BY t.fecha_registro DESC
    `);
    res.json(rows);
  })
);

// GET /superadmin/tenants/:id/resumen — flujo detallado de una clínica (doctores, asistentes, actividad)
router.get(
  '/tenants/:id/resumen',
  asyncHandler(async (req, res) => {
    const tenantId = req.params.id;

    const [tenant, equipo, actividad, ultimasCitas] = await Promise.all([
      req.db.query('SELECT * FROM tenants WHERE id = $1', [tenantId]),
      req.db.query(
        `SELECT e.id AS empleado_id, u.id AS usuario_id, u.nombres, u.apellidos, u.email, u.estado,
                e.tipo_empleado, e.especialidad, u.ultimo_acceso
         FROM empleados e JOIN usuarios u ON u.id = e.usuario_id
         WHERE e.tenant_id = $1
         ORDER BY e.tipo_empleado, u.nombres`,
        [tenantId]
      ),
      req.db.query(
        `SELECT
           (SELECT COUNT(*) FROM citas WHERE tenant_id = $1
              AND fecha_hora::date = (NOW() AT TIME ZONE ${TENANT_TZ_SQL})::date) AS citas_hoy,
           (SELECT COUNT(*) FROM citas WHERE tenant_id = $1
              AND fecha_hora >= date_trunc('week', NOW() AT TIME ZONE ${TENANT_TZ_SQL})) AS citas_semana,
           (SELECT COUNT(*) FROM citas WHERE tenant_id = $1 AND estado = 'atendida') AS citas_atendidas_total,
           (SELECT COUNT(*) FROM facturas WHERE tenant_id = $1) AS facturas_total`,
        [tenantId]
      ),
      req.db.query(
        `SELECT c.fecha_hora, c.tipo_cita, c.estado, m.nombre AS mascota,
                cl.nombres AS cliente_nombres, cl.apellidos AS cliente_apellidos
         FROM citas c
         JOIN mascotas m ON m.id = c.mascota_id
         JOIN clientes cl ON cl.id = c.cliente_id
         WHERE c.tenant_id = $1
         ORDER BY c.fecha_hora DESC LIMIT 10`,
        [tenantId]
      ),
    ]);

    if (!tenant.rows[0]) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Clínica no encontrada' } });
    }

    res.json({
      tenant: tenant.rows[0],
      equipo: equipo.rows,
      actividad: {
        citas_hoy: Number(actividad.rows[0].citas_hoy),
        citas_semana: Number(actividad.rows[0].citas_semana),
        citas_atendidas_total: Number(actividad.rows[0].citas_atendidas_total),
        facturas_total: Number(actividad.rows[0].facturas_total),
      },
      ultimas_citas: ultimasCitas.rows,
    });
  })
);

// POST /superadmin/tenants — crea una clínica nueva junto con su usuario admin
router.post(
  '/tenants',
  asyncHandler(async (req, res) => {
    const {
      nombre_comercial, razon_social, ruc, ciudad, provincia, telefono, email, timezone,
      admin_nombres, admin_apellidos, admin_email, admin_password,
    } = req.body;

    const requeridos = { nombre_comercial, razon_social, ruc, admin_nombres, admin_apellidos, admin_email, admin_password };
    const faltantes = Object.entries(requeridos).filter(([, v]) => !v).map(([k]) => k);
    if (faltantes.length) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: `Campos requeridos: ${faltantes.join(', ')}` } });
    }
    if (admin_password.length < 8) {
      return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'La contraseña debe tener al menos 8 caracteres' } });
    }

    const { rows: existente } = await req.db.query('SELECT id FROM usuarios WHERE email = $1', [admin_email]);
    if (existente[0]) {
      return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Ese correo ya está en uso' } });
    }

    const { rows: rolAdmin } = await req.db.query(
      "SELECT id FROM roles WHERE nombre = 'admin' AND tenant_id IS NULL LIMIT 1"
    );
    if (!rolAdmin[0]) {
      return res.status(500).json({ error: { code: 'ROLE_MISSING', message: "No existe el rol 'admin' del sistema" } });
    }

    const { rows: tenantRows } = await req.db.query(
      `INSERT INTO tenants (nombre_comercial, razon_social, ruc, ciudad, provincia, telefono, email, timezone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'America/Guayaquil'))
       RETURNING *`,
      [nombre_comercial, razon_social, ruc, ciudad || null, provincia || null, telefono || null, email || null, timezone || null]
    );
    const nuevoTenant = tenantRows[0];

    const passwordHash = await bcrypt.hash(admin_password, 10);
    const { rows: usuarioRows } = await req.db.query(
      `INSERT INTO usuarios (tenant_id, rol_id, nombres, apellidos, email, password_hash, debe_cambiar_pass)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       RETURNING id, nombres, apellidos, email`,
      [nuevoTenant.id, rolAdmin[0].id, admin_nombres, admin_apellidos, admin_email, passwordHash]
    );

    res.status(201).json({ tenant: nuevoTenant, admin: usuarioRows[0] });
  })
);

// PUT /superadmin/tenants/:id — editar datos de una clínica
router.put(
  '/tenants/:id',
  asyncHandler(async (req, res) => {
    const campos = ['nombre_comercial', 'razon_social', 'ruc', 'ciudad', 'provincia', 'telefono', 'email', 'timezone', 'plan_suscripcion', 'estado'];
    const cols = campos.filter((c) => req.body[c] !== undefined);
    if (!cols.length) {
      return res.status(400).json({ error: { code: 'NO_FIELDS', message: 'No se envió ningún campo para actualizar' } });
    }
    const values = cols.map((c) => req.body[c]);
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const { rows } = await req.db.query(
      `UPDATE tenants SET ${setClause} WHERE id = $${cols.length + 1} RETURNING *`,
      [...values, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Clínica no encontrada' } });
    res.json(rows[0]);
  })
);

// PATCH /superadmin/tenants/:id/admin-password — resetea la contraseña del admin de una clínica
router.patch(
  '/tenants/:id/admin-password',
  asyncHandler(async (req, res) => {
    const { password, usuario_id } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'La contraseña debe tener al menos 8 caracteres' } });
    }

    let targetUserId = usuario_id;
    if (!targetUserId) {
      const { rows } = await req.db.query(
        `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id
         WHERE u.tenant_id = $1 AND r.nombre = 'admin' ORDER BY u.fecha_creacion LIMIT 1`,
        [req.params.id]
      );
      if (!rows[0]) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Esa clínica no tiene un usuario admin' } });
      }
      targetUserId = rows[0].id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows: updated } = await req.db.query(
      `UPDATE usuarios SET password_hash = $1, debe_cambiar_pass = true
       WHERE id = $2 AND tenant_id = $3 RETURNING id, nombres, apellidos, email`,
      [passwordHash, targetUserId, req.params.id]
    );
    if (!updated[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Usuario no encontrado en esa clínica' } });
    res.json({ ok: true, usuario: updated[0] });
  })
);

module.exports = router;
