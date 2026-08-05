const express = require('express');
const { crudRouter } = require('../utils/crudFactory');
const { requireRole } = require('../middleware/roles.middleware');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

router.use(
  crudRouter({
    table: 'clientes',
    insertable: [
      'tipo_identificacion', 'numero_identificacion', 'nombres', 'apellidos', 'razon_social',
      'direccion', 'ciudad', 'provincia', 'telefono', 'telefono2', 'email',
      'referido_por', 'notas', 'estado',
    ],
    orderBy: 'nombres',
    searchable: ['nombres', 'apellidos', 'numero_identificacion', 'telefono'],
  })
);

// GET /clientes/:id/mascotas
router.get(
  '/:id/mascotas',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT m.*, e.nombre AS especie, r.nombre AS raza
       FROM mascotas m
       LEFT JOIN especies e ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       WHERE m.cliente_id = $1
       ORDER BY m.nombre`,
      [req.params.id]
    );
    res.json(rows);
  })
);

// GET /clientes/:id/facturas
router.get(
  '/:id/facturas',
  requireRole('admin', 'contador', 'secretaria'),
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT id, secuencial, fecha_emision, total, estado_sri
       FROM facturas WHERE cliente_id = $1 ORDER BY fecha_emision DESC`,
      [req.params.id]
    );
    res.json(rows);
  })
);

module.exports = router;
