const express = require('express');
const bcrypt = require('bcryptjs');
const { requireRole } = require('../middleware/roles.middleware');
const { asyncHandler, getPagination, paginatedResponse } = require('../utils/helpers');

const router = express.Router();

// GET /usuarios — lista los usuarios de la clínica (RLS ya filtra por tenant)
router.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { page, perPage, offset } = getPagination(req);
    const { rows: countRows } = await req.db.query('SELECT COUNT(*) FROM usuarios');
    const { rows } = await req.db.query(
      `SELECT u.id, u.nombres, u.apellidos, u.email, u.cedula, u.telefono, u.estado,
              u.ultimo_acceso, u.fecha_creacion, r.id AS rol_id, r.nombre AS rol,
              e.id AS empleado_id, e.tipo_empleado, e.especialidad
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN empleados e ON e.usuario_id = u.id
       ORDER BY u.nombres LIMIT $1 OFFSET $2`,
      [perPage, offset]
    );
    res.json(paginatedResponse(rows, countRows[0].count, { page, perPage }));
  })
);

// GET /usuarios/:id
router.get(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT u.id, u.nombres, u.apellidos, u.email, u.cedula, u.telefono, u.estado,
              r.id AS rol_id, r.nombre AS rol, e.id AS empleado_id, e.tipo_empleado, e.especialidad
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN empleados e ON e.usuario_id = u.id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } });
    res.json(rows[0]);
  })
);

// POST /usuarios — crea el usuario y, si aplica, su perfil de empleado, en una sola transacción
router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { nombres, apellidos, email, password, cedula, telefono, rol_id, tipo_empleado, especialidad, numero_registro_profesional } = req.body;

    if (!nombres || !apellidos || !email || !password || !rol_id) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'nombres, apellidos, email, password y rol_id son requeridos' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'La contraseña debe tener al menos 8 caracteres' } });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await req.db.query(
      `INSERT INTO usuarios (tenant_id, rol_id, cedula, nombres, apellidos, email, password_hash, telefono)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, nombres, apellidos, email, estado`,
      [req.user.tenantId, rol_id, cedula, nombres, apellidos, email, password_hash, telefono]
    );
    const usuario = rows[0];

    // Si el rol corresponde a personal clínico/operativo, crea también su ficha de empleado
    if (tipo_empleado) {
      await req.db.query(
        `INSERT INTO empleados (usuario_id, tenant_id, tipo_empleado, especialidad, numero_registro_profesional, fecha_ingreso)
         VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)`,
        [usuario.id, req.user.tenantId, tipo_empleado, especialidad, numero_registro_profesional]
      );
    }

    res.status(201).json(usuario);
  })
);

// PATCH /usuarios/:id/rol — cambiar el rol de un usuario
router.patch(
  '/:id/rol',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rol_id } = req.body;
    const { rows } = await req.db.query(
      'UPDATE usuarios SET rol_id = $1 WHERE id = $2 RETURNING id, nombres, apellidos, rol_id',
      [rol_id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } });
    res.json(rows[0]);
  })
);

// PATCH /usuarios/:id/estado — activar / desactivar / bloquear
router.patch(
  '/:id/estado',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { estado } = req.body;
    const validos = ['activo', 'inactivo', 'bloqueado'];
    if (!validos.includes(estado)) {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: `estado debe ser: ${validos.join(', ')}` } });
    }
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: { code: 'SELF_ACTION', message: 'No puedes cambiar el estado de tu propia cuenta' } });
    }
    const { rows } = await req.db.query('UPDATE usuarios SET estado = $1 WHERE id = $2 RETURNING id, nombres, apellidos, estado', [estado, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } });
    res.json(rows[0]);
  })
);

// PUT /usuarios/:id — editar datos básicos
router.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const cols = ['nombres', 'apellidos', 'cedula', 'telefono'].filter((c) => req.body[c] !== undefined);
    if (!cols.length) return res.status(400).json({ error: { code: 'EMPTY_UPDATE', message: 'Nada que actualizar' } });
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const values = cols.map((c) => req.body[c]);
    values.push(req.params.id);
    const { rows } = await req.db.query(`UPDATE usuarios SET ${setClause} WHERE id = $${values.length} RETURNING *`, values);
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } });
    res.json(rows[0]);
  })
);

module.exports = router;
