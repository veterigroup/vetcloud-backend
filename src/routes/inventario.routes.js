const express = require('express');
const { crudRouter } = require('../utils/crudFactory');
const { requireRole } = require('../middleware/roles.middleware');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

// GET /productos/stock-bajo — para la alerta del dashboard
router.get(
  '/stock-bajo',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT id, nombre, stock_actual, stock_minimo
       FROM productos
       WHERE stock_actual <= stock_minimo AND estado = 'activo'
       ORDER BY (stock_actual - stock_minimo) ASC`
    );
    res.json(rows);
  })
);

// POST /productos/:id/movimientos — entrada/salida/ajuste/merma, actualiza stock_actual
router.post(
  '/:id/movimientos',
  requireRole('admin', 'contador', 'auxiliar'),
  asyncHandler(async (req, res) => {
    const { tipo_movimiento, cantidad, motivo, referencia_tabla, referencia_id } = req.body;
    const validos = ['entrada', 'salida', 'ajuste', 'merma'];
    if (!validos.includes(tipo_movimiento)) {
      return res.status(400).json({ error: { code: 'INVALID_TYPE', message: `tipo_movimiento debe ser: ${validos.join(', ')}` } });
    }

    const delta = ['entrada'].includes(tipo_movimiento) ? cantidad : -Math.abs(cantidad);

    const { rows } = await req.db.query(
      `INSERT INTO movimientos_inventario
        (tenant_id, producto_id, tipo_movimiento, cantidad, motivo, referencia_tabla, referencia_id, empleado_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.tenantId, req.params.id, tipo_movimiento, cantidad, motivo, referencia_tabla, referencia_id, req.body.empleado_id]
    );

    await req.db.query('UPDATE productos SET stock_actual = stock_actual + $1 WHERE id = $2', [delta, req.params.id]);

    res.status(201).json(rows[0]);
  })
);

router.use(
  crudRouter({
    table: 'productos',
    insertable: [
      'categoria_id', 'proveedor_id', 'codigo_interno', 'codigo_barras', 'nombre', 'descripcion',
      'unidad_medida', 'precio_compra', 'precio_venta', 'stock_actual', 'stock_minimo',
      'requiere_receta', 'estado',
    ],
    orderBy: 'nombre',
    searchable: ['nombre', 'codigo_interno', 'codigo_barras'],
  })
);

module.exports = router;
