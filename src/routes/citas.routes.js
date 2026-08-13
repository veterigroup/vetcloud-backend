const express = require('express');
const { crudRouter } = require('../utils/crudFactory');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

const baseFields = `c.id, c.fecha_hora, c.tipo_cita, c.motivo, c.estado,
  m.nombre AS mascota, cl.nombres AS cliente_nombres, cl.apellidos AS cliente_apellidos,
  ep.nombres AS doctor_nombres, ep.apellidos AS doctor_apellidos`;
const baseJoins = `FROM citas c
  JOIN mascotas m ON m.id = c.mascota_id
  JOIN clientes cl ON cl.id = c.cliente_id
  LEFT JOIN empleados emp ON emp.id = c.empleado_id
  LEFT JOIN usuarios ep ON ep.id = emp.usuario_id`;

// GET /citas/hoy
router.get(
  '/hoy',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT ${baseFields} ${baseJoins}
       WHERE c.fecha_hora::date
           = (NOW() AT TIME ZONE 'America/Guayaquil')::date
       ORDER BY c.fecha_hora`
    );
    res.json(rows);
  })
);

// GET /citas/proximas?limit=5
router.get(
  '/proximas',
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
    const { rows } = await req.db.query(
      `SELECT ${baseFields} ${baseJoins}
       WHERE c.fecha_hora >= NOW() AND c.estado NOT IN ('cancelada', 'no_asistio')
       ORDER BY c.fecha_hora LIMIT $1`,
      [limit]
    );
    res.json(rows);
  })
);

// PATCH /citas/:id/estado
router.patch(
  '/:id/estado',
  asyncHandler(async (req, res) => {
    const { estado } = req.body;
    const validos = ['pendiente', 'confirmada', 'atendida', 'cancelada', 'no_asistio'];
    if (!validos.includes(estado)) {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: `estado debe ser uno de: ${validos.join(', ')}` } });
    }
    const { rows } = await req.db.query('UPDATE citas SET estado = $1 WHERE id = $2 RETURNING *', [estado, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Cita no encontrada' } });
    res.json(rows[0]);
  })
);

// GET /citas/rango?desde=YYYY-MM-DD&hasta=YYYY-MM-DD — para la vista de agenda por día
router.get(
  '/rango',
  asyncHandler(async (req, res) => {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) {
      return res.status(400).json({ error: { code: 'MISSING_RANGE', message: 'desde y hasta son requeridos (YYYY-MM-DD)' } });
    }
    const { rows } = await req.db.query(
      `SELECT ${baseFields}, c.mascota_id, c.cliente_id, c.empleado_id ${baseJoins}
       WHERE c.fecha_hora::date BETWEEN $1 AND $2
       ORDER BY c.fecha_hora`,
      [desde, hasta]
    );
    res.json(rows);
  })
);

router.use(
  crudRouter({
    table: 'citas',
    insertable: ['mascota_id', 'cliente_id', 'empleado_id', 'fecha_hora', 'tipo_cita', 'motivo', 'estado'],
    orderBy: 'fecha_hora',
  })
);

module.exports = router;
