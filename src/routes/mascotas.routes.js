const express = require('express');
const { crudRouter } = require('../utils/crudFactory');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

router.use(
  crudRouter({
    table: 'mascotas',
    insertable: [
      'cliente_id', 'nombre', 'especie_id', 'raza_id', 'sexo', 'fecha_nacimiento',
      'edad_aproximada', 'color', 'peso_actual_kg', 'esterilizado', 'microchip',
      'foto_url', 'senas_particulares', 'estado', 'fecha_fallecimiento',
    ],
    orderBy: 'nombre',
    searchable: ['nombre', 'microchip'],
  })
);

// GET /mascotas/:id/historial — línea de tiempo unificada (historial_eventos_mascota)
router.get(
  '/:id/historial',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT tipo_evento, referencia_tabla, referencia_id, titulo, descripcion, fecha,
              e.nombres AS empleado_nombres, e.apellidos AS empleado_apellidos
       FROM historial_eventos_mascota h
       LEFT JOIN empleados emp ON emp.id = h.empleado_id
       LEFT JOIN usuarios e ON e.id = emp.usuario_id
       WHERE h.mascota_id = $1
       ORDER BY h.fecha DESC`,
      [req.params.id]
    );
    res.json(rows);
  })
);

// GET /mascotas/:id/historia-clinica — ficha clínica (alergias, condiciones)
router.get(
  '/:id/historia-clinica',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query('SELECT * FROM historias_clinicas WHERE mascota_id = $1', [req.params.id]);
    res.json(rows[0] || null);
  })
);

// GET /mascotas/:id/consultas — historial de consultas médicas
router.get(
  '/:id/consultas',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT c.*, ep.nombres AS doctor_nombres, ep.apellidos AS doctor_apellidos
       FROM consultas c
       JOIN empleados emp ON emp.id = c.doctor_id
       JOIN usuarios ep ON ep.id = emp.usuario_id
       WHERE c.mascota_id = $1
       ORDER BY c.fecha DESC`,
      [req.params.id]
    );
    res.json(rows);
  })
);

module.exports = router;
