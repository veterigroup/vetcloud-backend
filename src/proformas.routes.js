const express = require('express');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

// GET /roles — catálogo de roles disponibles (para el selector al crear/editar usuarios)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // roles del sistema (tenant_id NULL) — la política RLS de roles ya permite verlos a todos
    const { rows } = await req.db.query(
      "SELECT id, nombre, descripcion FROM roles WHERE tenant_id IS NULL AND nombre != 'superadmin' ORDER BY nombre"
    );
    res.json(rows);
  })
);

module.exports = router;
