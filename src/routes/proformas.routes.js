const express = require('express');
const { requireRole } = require('../middleware/roles.middleware');
const { asyncHandler } = require('../utils/helpers');
const { registrarHistorial } = require('../utils/historial');

const router = express.Router();

// GET /proformas
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { estado } = req.query;
    const params = [];
    let where = '';
    if (estado) {
      params.push(estado);
      where = 'WHERE p.estado = $1';
    }
    const { rows } = await req.db.query(
      `SELECT p.*, c.nombres AS cliente_nombres, c.apellidos AS cliente_apellidos, m.nombre AS mascota
       FROM proformas p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN mascotas m ON m.id = p.mascota_id
       ${where}
       ORDER BY p.fecha_emision DESC`,
      params
    );
    res.json(rows);
  })
);

// GET /proformas/:id (con detalle)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query('SELECT * FROM proformas WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
    const { rows: detalle } = await req.db.query('SELECT * FROM proforma_detalle WHERE proforma_id = $1', [req.params.id]);
    res.json({ ...rows[0], detalle });
  })
);

// POST /proformas — crea la proforma + su detalle en una sola transacción (req.db ya es transaccional)
router.post(
  '/',
  requireRole('doctor', 'secretaria', 'admin'),
  asyncHandler(async (req, res) => {
    const { cliente_id, mascota_id, empleado_id, fecha_validez, observaciones, items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: { code: 'EMPTY_ITEMS', message: 'La proforma necesita al menos un ítem' } });
    }

    const subtotal = items.reduce((acc, it) => acc + it.cantidad * it.precio_unitario - (it.descuento || 0), 0);
    const iva = Math.round(subtotal * 0.15 * 100) / 100;
    const total = subtotal + iva;

    const { rows } = await req.db.query(
      `INSERT INTO proformas
        (tenant_id, cliente_id, mascota_id, empleado_id, fecha_validez, subtotal_12, iva_valor, total, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.tenantId, cliente_id, mascota_id, empleado_id, fecha_validez, subtotal, iva, total, observaciones]
    );
    const proforma = rows[0];

    for (const it of items) {
      await req.db.query(
        `INSERT INTO proforma_detalle (tenant_id, proforma_id, producto_id, tratamiento_id, descripcion, cantidad, precio_unitario, descuento, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.user.tenantId, proforma.id, it.producto_id || null, it.tratamiento_id || null, it.descripcion, it.cantidad, it.precio_unitario, it.descuento || 0, it.cantidad * it.precio_unitario - (it.descuento || 0)]
      );
    }

    await registrarHistorial(req.db, {
      tenantId: req.user.tenantId,
      mascotaId: mascota_id,
      tipo: 'proforma',
      tabla: 'proformas',
      refId: proforma.id,
      titulo: `Proforma por $${total.toFixed(2)}`,
      descripcion: observaciones,
      empleadoId: empleado_id,
    });

    res.status(201).json(proforma);
  })
);

// PATCH /proformas/:id/aprobar
router.patch(
  '/:id/aprobar',
  requireRole('secretaria', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      "UPDATE proformas SET estado = 'aprobada' WHERE id = $1 AND estado = 'pendiente' RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(409).json({ error: { code: 'INVALID_STATE', message: 'La proforma no está pendiente' } });
    res.json(rows[0]);
  })
);

// PATCH /proformas/:id/rechazar
router.patch(
  '/:id/rechazar',
  requireRole('secretaria', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      "UPDATE proformas SET estado = 'rechazada' WHERE id = $1 AND estado = 'pendiente' RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(409).json({ error: { code: 'INVALID_STATE', message: 'La proforma no está pendiente' } });
    res.json(rows[0]);
  })
);

// POST /proformas/:id/facturar — convierte una proforma aprobada en factura + su detalle
router.post(
  '/:id/facturar',
  requireRole('contador', 'admin'),
  asyncHandler(async (req, res) => {
    const { establecimiento, punto_emision, secuencial, forma_pago_id } = req.body;

    const { rows: proformaRows } = await req.db.query('SELECT * FROM proformas WHERE id = $1', [req.params.id]);
    const proforma = proformaRows[0];
    if (!proforma) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Proforma no encontrada' } });
    if (proforma.estado !== 'aprobada') {
      return res.status(409).json({ error: { code: 'INVALID_STATE', message: 'Solo se factura una proforma aprobada' } });
    }

    const { rows: detalle } = await req.db.query('SELECT * FROM proforma_detalle WHERE proforma_id = $1', [req.params.id]);

    const { rows: facturaRows } = await req.db.query(
      `INSERT INTO facturas
        (tenant_id, cliente_id, establecimiento, punto_emision, secuencial, subtotal_12, iva_valor, total, forma_pago_id, proforma_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.tenantId, proforma.cliente_id, establecimiento, punto_emision, secuencial, proforma.subtotal_12, proforma.iva_valor, proforma.total, forma_pago_id, proforma.id]
    );
    const factura = facturaRows[0];

    for (const it of detalle) {
      await req.db.query(
        `INSERT INTO factura_detalle (tenant_id, factura_id, producto_id, tratamiento_id, descripcion, cantidad, precio_unitario, descuento, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.user.tenantId, factura.id, it.producto_id, it.tratamiento_id, it.descripcion, it.cantidad, it.precio_unitario, it.descuento, it.subtotal]
      );
    }

    await req.db.query("UPDATE proformas SET estado = 'facturada', factura_id = $1 WHERE id = $2", [factura.id, proforma.id]);

    await registrarHistorial(req.db, {
      tenantId: req.user.tenantId,
      mascotaId: proforma.mascota_id,
      tipo: 'factura',
      tabla: 'facturas',
      refId: factura.id,
      titulo: `Factura ${establecimiento}-${punto_emision}-${secuencial}`,
      descripcion: `Total: $${proforma.total}`,
      empleadoId: req.body.empleado_id,
    });

    res.status(201).json(factura);
  })
);

module.exports = router;
