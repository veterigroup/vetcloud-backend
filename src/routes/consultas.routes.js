const express = require('express');
const { requireRole } = require('../middleware/roles.middleware');
const { asyncHandler } = require('../utils/helpers');
const { registrarHistorial } = require('../utils/historial');

const router = express.Router();

// POST /consultas — registra la consulta y automáticamente el evento en el historial
router.post(
  '/',
  requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const {
      cita_id, mascota_id, doctor_id, motivo_consulta, anamnesis, temperatura_c, peso_kg,
      frecuencia_cardiaca, frecuencia_respiratoria, examen_fisico, diagnostico_presuntivo,
      diagnostico_definitivo, plan_tratamiento, observaciones, proxima_cita_sugerida,
    } = req.body;

    const { rows } = await req.db.query(
      `INSERT INTO consultas
        (tenant_id, cita_id, mascota_id, doctor_id, motivo_consulta, anamnesis, temperatura_c, peso_kg,
         frecuencia_cardiaca, frecuencia_respiratoria, examen_fisico, diagnostico_presuntivo,
         diagnostico_definitivo, plan_tratamiento, observaciones, proxima_cita_sugerida)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        req.user.tenantId, cita_id || null, mascota_id, doctor_id, motivo_consulta, anamnesis,
        temperatura_c, peso_kg, frecuencia_cardiaca, frecuencia_respiratoria, examen_fisico,
        diagnostico_presuntivo, diagnostico_definitivo, plan_tratamiento, observaciones, proxima_cita_sugerida,
      ]
    );
    const consulta = rows[0];

    if (cita_id) {
      await req.db.query("UPDATE citas SET estado = 'atendida' WHERE id = $1", [cita_id]);
    }

    await registrarHistorial(req.db, {
      tenantId: req.user.tenantId,
      mascotaId: mascota_id,
      tipo: 'consulta',
      tabla: 'consultas',
      refId: consulta.id,
      titulo: motivo_consulta || 'Consulta general',
      descripcion: diagnostico_presuntivo,
      empleadoId: doctor_id,
    });

    res.status(201).json(consulta);
  })
);

// POST /consultas/:id/tratamientos — aplica un tratamiento y lo suma al historial
router.post(
  '/:id/tratamientos',
  requireRole('doctor', 'auxiliar'),
  asyncHandler(async (req, res) => {
    const { tratamiento_id, mascota_id, empleado_id, dosis, via_administracion, costo, observaciones } = req.body;

    const { rows } = await req.db.query(
      `INSERT INTO tratamientos_aplicados
        (tenant_id, consulta_id, tratamiento_id, mascota_id, empleado_id, dosis, via_administracion, costo, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.tenantId, req.params.id, tratamiento_id, mascota_id, empleado_id, dosis, via_administracion, costo, observaciones]
    );
    const aplicado = rows[0];

    const { rows: trat } = await req.db.query('SELECT nombre FROM tratamientos WHERE id = $1', [tratamiento_id]);

    await registrarHistorial(req.db, {
      tenantId: req.user.tenantId,
      mascotaId: mascota_id,
      tipo: 'tratamiento',
      tabla: 'tratamientos_aplicados',
      refId: aplicado.id,
      titulo: trat[0]?.nombre || 'Tratamiento aplicado',
      descripcion: observaciones,
      empleadoId: empleado_id,
    });

    res.status(201).json(aplicado);
  })
);

// GET /consultas/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query('SELECT * FROM consultas WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Consulta no encontrada' } });
    res.json(rows[0]);
  })
);

module.exports = router;
