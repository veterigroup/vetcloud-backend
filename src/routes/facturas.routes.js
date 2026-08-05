const express = require('express');
const { requireRole } = require('../middleware/roles.middleware');
const { asyncHandler, getPagination, paginatedResponse } = require('../utils/helpers');

const router = express.Router();

// GET /facturas
router.get(
  '/',
  requireRole('admin', 'contador', 'secretaria'),
  asyncHandler(async (req, res) => {
    const { page, perPage, offset } = getPagination(req);
    const { rows: countRows } = await req.db.query('SELECT COUNT(*) FROM facturas');
    const { rows } = await req.db.query(
      `SELECT f.id, f.secuencial, f.fecha_emision, f.total, f.estado_sri, c.nombres, c.apellidos
       FROM facturas f JOIN clientes c ON c.id = f.cliente_id
       ORDER BY f.fecha_emision DESC LIMIT $1 OFFSET $2`,
      [perPage, offset]
    );
    res.json(paginatedResponse(rows, countRows[0].count, { page, perPage }));
  })
);

// GET /facturas/:id (con detalle y pagos)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query('SELECT * FROM facturas WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Factura no encontrada' } });
    const { rows: detalle } = await req.db.query('SELECT * FROM factura_detalle WHERE factura_id = $1', [req.params.id]);
    const { rows: pagos } = await req.db.query('SELECT * FROM pagos WHERE factura_id = $1 ORDER BY fecha', [req.params.id]);
    res.json({ ...rows[0], detalle, pagos });
  })
);

// POST /facturas/:id/pagos
router.post(
  '/:id/pagos',
  requireRole('contador', 'secretaria'),
  asyncHandler(async (req, res) => {
    const { forma_pago_id, monto, referencia, empleado_id } = req.body;
    const { rows } = await req.db.query(
      `INSERT INTO pagos (tenant_id, factura_id, forma_pago_id, monto, referencia, empleado_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.tenantId, req.params.id, forma_pago_id, monto, referencia, empleado_id]
    );

    await req.db.query(
      `UPDATE cuentas_por_cobrar SET saldo_pendiente = GREATEST(saldo_pendiente - $1, 0),
         estado = CASE WHEN saldo_pendiente - $1 <= 0 THEN 'pagada' ELSE 'pendiente' END
       WHERE factura_id = $2`,
      [monto, req.params.id]
    );

    res.status(201).json(rows[0]);
  })
);

// POST /facturas/:id/anular
router.post(
  '/:id/anular',
  requireRole('contador', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      "UPDATE facturas SET estado_sri = 'anulada' WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Factura no encontrada' } });
    res.json(rows[0]);
  })
);

// GET /cuentas-por-cobrar (montado también aquí para simplicidad de import)
router.get(
  '/reportes/cuentas-por-cobrar',
  requireRole('admin', 'contador'),
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT cxc.*, c.nombres, c.apellidos
       FROM cuentas_por_cobrar cxc
       JOIN clientes c ON c.id = cxc.cliente_id
       WHERE cxc.estado = 'pendiente'
       ORDER BY cxc.fecha_vencimiento`
    );
    res.json(rows);
  })
);

module.exports = router;
