const express = require('express');
const { crudRouter } = require('../utils/crudFactory');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

// GET /especies
router.get(
  '/especies',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query('SELECT id, nombre FROM especies ORDER BY nombre');
    res.json(rows);
  })
);

// POST /especies — agrega una especie nueva (propia de la clínica, no global)
router.post(
  '/especies',
  asyncHandler(async (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'El nombre es requerido' } });
    }
    const { rows } = await req.db.query(
      'INSERT INTO especies (tenant_id, nombre) VALUES ($1, $2) RETURNING id, nombre',
      [req.user.tenantId, nombre.trim()]
    );
    res.status(201).json(rows[0]);
  })
);

// GET /razas?especie_id=1
router.get(
  '/razas',
  asyncHandler(async (req, res) => {
    const { especie_id } = req.query;
    const params = [];
    let where = '';
    if (especie_id) {
      params.push(especie_id);
      where = 'WHERE especie_id = $1';
    }
    const { rows } = await req.db.query(`SELECT id, especie_id, nombre FROM razas ${where} ORDER BY nombre`, params);
    res.json(rows);
  })
);

// POST /razas — agrega una raza nueva para una especie existente
router.post(
  '/razas',
  asyncHandler(async (req, res) => {
    const { especie_id, nombre } = req.body;
    if (!especie_id || !nombre || !nombre.trim()) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'especie_id y nombre son requeridos' } });
    }
    const { rows } = await req.db.query(
      'INSERT INTO razas (especie_id, nombre) VALUES ($1, $2) RETURNING id, especie_id, nombre',
      [especie_id, nombre.trim()]
    );
    res.status(201).json(rows[0]);
  })
);

// GET/POST /tratamientos — catálogo de tratamientos de la clínica
router.use(
  '/tratamientos',
  crudRouter({
    table: 'tratamientos',
    insertable: ['nombre', 'categoria', 'descripcion', 'precio', 'duracion_estimada_min'],
    orderBy: 'nombre',
    searchable: ['nombre'],
  })
);

// GET/POST /vacunas — catálogo de vacunas de la clínica
router.use(
  '/vacunas',
  crudRouter({
    table: 'vacunas',
    insertable: ['nombre', 'enfermedad_previene', 'especie_id', 'fabricante'],
    orderBy: 'nombre',
    searchable: ['nombre'],
  })
);

module.exports = router;
