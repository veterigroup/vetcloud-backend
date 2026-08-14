const express = require('express');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

const CAMPOS_EDITABLES = ['nombre_comercial', 'razon_social', 'ruc', 'ciudad', 'provincia', 'telefono', 'email', 'timezone'];

const ZONAS_DISPONIBLES = [
  'America/Guayaquil', 'America/Bogota', 'America/Lima', 'America/Santiago',
  'America/Mexico_City', 'America/Argentina/Buenos_Aires', 'Europe/Madrid',
];

function requireAdminDeClinica(req, res, next) {
  if (req.user.rol !== 'admin' && !req.user.isSuperadmin) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Solo el administrador de la clínica puede ver o cambiar esta configuración' },
    });
  }
  next();
}

// GET /configuracion — datos de la propia clínica (cualquier rol autenticado puede leerlos)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT id, nombre_comercial, razon_social, ruc, ciudad, provincia, telefono, email, timezone, plan_suscripcion, estado
       FROM tenants WHERE id = $1`,
      [req.user.tenantId]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Clínica no encontrada' } });
    res.json({ ...rows[0], zonas_disponibles: ZONAS_DISPONIBLES });
  })
);

// PUT /configuracion — la propia clínica edita sus datos (solo su admin; el estado y el plan
// de suscripción quedan fuera porque son datos que controla el superadmin de la plataforma)
router.put(
  '/',
  requireAdminDeClinica,
  asyncHandler(async (req, res) => {
    const cols = CAMPOS_EDITABLES.filter((c) => req.body[c] !== undefined);
    if (!cols.length) {
      return res.status(400).json({ error: { code: 'NO_FIELDS', message: 'No se envió ningún campo para actualizar' } });
    }
    if (req.body.timezone && !ZONAS_DISPONIBLES.includes(req.body.timezone)) {
      return res.status(400).json({ error: { code: 'INVALID_TIMEZONE', message: 'Zona horaria no soportada' } });
    }
    const values = cols.map((c) => req.body[c]);
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    try {
      const { rows } = await req.db.query(
        `UPDATE tenants SET ${setClause} WHERE id = $${cols.length + 1}
         RETURNING id, nombre_comercial, razon_social, ruc, ciudad, provincia, telefono, email, timezone, plan_suscripcion, estado`,
        [...values, req.user.tenantId]
      );
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'tenants_ruc_key') {
        return res.status(409).json({ error: { code: 'RUC_TAKEN', message: 'Ese RUC ya está registrado en otra clínica' } });
      }
      throw err;
    }
  })
);

module.exports = router;
