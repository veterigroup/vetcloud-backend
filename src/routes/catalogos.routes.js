const express = require('express');
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

module.exports = router;
