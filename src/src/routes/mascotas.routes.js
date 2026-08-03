const express = require('express');
const { crudRouter } = require('../utils/crudFactory');
const { asyncHandler, getPagination, paginatedResponse } = require('../utils/helpers');
const { registrarHistorial } = require('../utils/historial');
const { descontarStock } = require('../utils/inventario');

const router = express.Router();

// GET /mascotas — listado con nombre de especie/raza y filtro opcional por cliente_id
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, offset } = getPagination(req);
    const params = [];
    const conditions = [];

    if (req.query.cliente_id) {
      params.push(req.query.cliente_id);
      conditions.push(`m.cliente_id = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      conditions.push(`(m.nombre ILIKE $${params.length} OR m.microchip ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await req.db.query(`SELECT COUNT(*) FROM mascotas m ${where}`, params);
    params.push(perPage, offset);
    const { rows } = await req.db.query(
      `SELECT m.*, e.nombre AS especie, r.nombre AS raza, c.nombres AS cliente_nombres, c.apellidos AS cliente_apellidos
       FROM mascotas m
       LEFT JOIN especies e ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       JOIN clientes c ON c.id = m.cliente_id
       ${where}
       ORDER BY m.nombre LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(paginatedResponse(rows, countRows[0].count, { page, perPage }));
  })
);

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

// PUT /mascotas/:id/historia-clinica — crea la ficha si no existe, o la actualiza si ya existe
router.put(
  '/:id/historia-clinica',
  asyncHandler(async (req, res) => {
    const { alergias, condiciones_preexistentes, observaciones_generales } = req.body;
    const { rows } = await req.db.query(
      `INSERT INTO historias_clinicas (mascota_id, tenant_id, alergias, condiciones_preexistentes, observaciones_generales)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (mascota_id) DO UPDATE SET
         alergias = EXCLUDED.alergias,
         condiciones_preexistentes = EXCLUDED.condiciones_preexistentes,
         observaciones_generales = EXCLUDED.observaciones_generales
       RETURNING *`,
      [req.params.id, req.user.tenantId, alergias || null, condiciones_preexistentes || null, observaciones_generales || null]
    );
    res.json(rows[0]);
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

// POST /mascotas/:id/aplicar-tratamiento — acción clínica directa (sin pasar por una consulta)
router.post(
  '/:id/aplicar-tratamiento',
  asyncHandler(async (req, res) => {
    const mascotaId = req.params.id;
    const { tratamiento_id, empleado_id, dosis, via_administracion, costo, observaciones, producto_id, cantidad_producto } = req.body;

    if (!tratamiento_id || !empleado_id) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'tratamiento_id y empleado_id son requeridos' } });
    }

    const { rows } = await req.db.query(
      `INSERT INTO tratamientos_aplicados
        (tenant_id, tratamiento_id, mascota_id, empleado_id, dosis, via_administracion, costo, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.tenantId, tratamiento_id, mascotaId, empleado_id, dosis, via_administracion, costo, observaciones]
    );
    const aplicado = rows[0];

    // Si se marcó un producto del inventario, se descuenta el stock automáticamente
    await descontarStock(req.db, {
      tenantId: req.user.tenantId,
      productoId: producto_id,
      cantidad: cantidad_producto,
      motivo: 'Consumo por tratamiento aplicado',
      referenciaTabla: 'tratamientos_aplicados',
      referenciaId: aplicado.id,
      empleadoId: empleado_id,
    });

    const { rows: trat } = await req.db.query('SELECT nombre FROM tratamientos WHERE id = $1', [tratamiento_id]);
    await registrarHistorial(req.db, {
      tenantId: req.user.tenantId,
      mascotaId,
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

// POST /mascotas/:id/aplicar-vacuna
router.post(
  '/:id/aplicar-vacuna',
  asyncHandler(async (req, res) => {
    const mascotaId = req.params.id;
    const { vacuna_id, empleado_id, fecha_aplicacion, lote, fecha_proxima_dosis, producto_id, cantidad_producto } = req.body;

    if (!vacuna_id || !empleado_id || !fecha_aplicacion) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'vacuna_id, empleado_id y fecha_aplicacion son requeridos' } });
    }

    const { rows } = await req.db.query(
      `INSERT INTO vacunas_aplicadas (tenant_id, mascota_id, vacuna_id, empleado_id, fecha_aplicacion, lote, fecha_proxima_dosis)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.tenantId, mascotaId, vacuna_id, empleado_id, fecha_aplicacion, lote, fecha_proxima_dosis]
    );
    const aplicada = rows[0];

    await descontarStock(req.db, {
      tenantId: req.user.tenantId,
      productoId: producto_id,
      cantidad: cantidad_producto,
      motivo: 'Consumo por vacuna aplicada',
      referenciaTabla: 'vacunas_aplicadas',
      referenciaId: aplicada.id,
      empleadoId: empleado_id,
    });

    const { rows: vac } = await req.db.query('SELECT nombre FROM vacunas WHERE id = $1', [vacuna_id]);
    await registrarHistorial(req.db, {
      tenantId: req.user.tenantId,
      mascotaId,
      tipo: 'vacuna',
      tabla: 'vacunas_aplicadas',
      refId: aplicada.id,
      titulo: vac[0]?.nombre || 'Vacuna aplicada',
      descripcion: fecha_proxima_dosis ? `Próxima dosis: ${fecha_proxima_dosis}` : null,
      empleadoId: empleado_id,
    });

    // Si se programó fecha de refuerzo, se crea la cita automáticamente —
    // así aparece sola en "Próximas citas" del dashboard, sin pasos extra.
    if (fecha_proxima_dosis) {
      const { rows: mascotaRow } = await req.db.query('SELECT cliente_id FROM mascotas WHERE id = $1', [mascotaId]);
      if (mascotaRow[0]) {
        await req.db.query(
          `INSERT INTO citas (tenant_id, mascota_id, cliente_id, fecha_hora, tipo_cita, motivo, estado, creado_por)
           VALUES ($1,$2,$3,$4,'vacunacion',$5,'pendiente',$6)`,
          [
            req.user.tenantId, mascotaId, mascotaRow[0].cliente_id,
            `${fecha_proxima_dosis} 09:00:00`,
            `Refuerzo: ${vac[0]?.nombre || 'vacuna'}`,
            req.user.id,
          ]
        );
      }
    }

    res.status(201).json(aplicada);
  })
);

module.exports = router;
