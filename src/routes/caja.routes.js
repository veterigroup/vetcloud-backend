const express = require('express');
const { requireRole } = require('../middleware/roles.middleware');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

// POST /caja/apertura
router.post(
  '/apertura',
  requireRole('secretaria', 'contador'),
  asyncHandler(async (req, res) => {
    const { empleado_id, monto_inicial } = req.body;
    const { rows } = await req.db.query(
      `INSERT INTO caja (tenant_id, empleado_id, fecha_apertura, monto_inicial)
       VALUES ($1,$2,NOW(),$3) RETURNING *`,
      [req.user.tenantId, empleado_id, monto_inicial || 0]
    );
    res.status(201).json(rows[0]);
  })
);

// POST /caja/cierre
router.post(
  '/cierre',
  requireRole('secretaria', 'contador'),
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `UPDATE caja SET fecha_cierre = NOW(), monto_final = $1, estado = 'cerrada'
       WHERE id = $2 RETURNING *`,
      [req.body.monto_final, req.body.caja_id]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Caja no encontrada' } });
    res.json(rows[0]);
  })
);

// GET /caja/actual
router.get(
  '/actual',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query("SELECT * FROM caja WHERE estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1");
    res.json(rows[0] || null);
  })
);

// GET /caja/historial — últimas cajas abiertas/cerradas
router.get(
  '/historial',
  requireRole('admin', 'contador', 'secretaria'),
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT c.*, u.nombres AS empleado_nombres, u.apellidos AS empleado_apellidos
       FROM caja c
       LEFT JOIN empleados e ON e.id = c.empleado_id
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       ORDER BY c.fecha_apertura DESC LIMIT 30`
    );
    res.json(rows);
  })
);

// GET /caja-chica/fondos
router.get(
  '/caja-chica/fondos',
  requireRole('admin', 'contador'),
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query('SELECT * FROM caja_chica_fondos ORDER BY nombre');
    res.json(rows);
  })
);

// POST /caja-chica/fondos — crea un fondo de caja chica nuevo
router.post(
  '/caja-chica/fondos',
  requireRole('admin', 'contador'),
  asyncHandler(async (req, res) => {
    const { nombre, monto_asignado, responsable_id } = req.body;
    if (!nombre || monto_asignado === undefined) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'nombre y monto_asignado son requeridos' } });
    }
    const { rows } = await req.db.query(
      `INSERT INTO caja_chica_fondos (tenant_id, nombre, monto_asignado, saldo_actual, responsable_id)
       VALUES ($1,$2,$3,$3,$4) RETURNING *`,
      [req.user.tenantId, nombre, monto_asignado, responsable_id || null]
    );
    res.status(201).json(rows[0]);
  })
);

// GET /caja-chica/:id/movimientos — historial de gastos/reposiciones de un fondo
router.get(
  '/caja-chica/:id/movimientos',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT m.*, e.usuario_id, u.nombres AS empleado_nombres, u.apellidos AS empleado_apellidos
       FROM caja_chica_movimientos m
       LEFT JOIN empleados e ON e.id = m.empleado_id
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       WHERE m.fondo_id = $1
       ORDER BY m.fecha DESC`,
      [req.params.id]
    );
    res.json(rows);
  })
);

// POST /caja-chica/:id/movimientos — gasto o reposición del fondo
router.post(
  '/caja-chica/:id/movimientos',
  asyncHandler(async (req, res) => {
    const { tipo_movimiento, categoria_gasto, concepto, monto, comprobante_url, empleado_id } = req.body;
    const validos = ['gasto', 'reposicion'];
    if (!validos.includes(tipo_movimiento)) {
      return res.status(400).json({ error: { code: 'INVALID_TYPE', message: `tipo_movimiento debe ser: ${validos.join(', ')}` } });
    }

    const { rows } = await req.db.query(
      `INSERT INTO caja_chica_movimientos (fondo_id, tipo_movimiento, categoria_gasto, concepto, monto, comprobante_url, empleado_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, tipo_movimiento, categoria_gasto, concepto, monto, comprobante_url, empleado_id]
    );

    const delta = tipo_movimiento === 'reposicion' ? monto : -monto;
    await req.db.query('UPDATE caja_chica_fondos SET saldo_actual = saldo_actual + $1 WHERE id = $2', [delta, req.params.id]);

    res.status(201).json(rows[0]);
  })
);

module.exports = router;
