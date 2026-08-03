const express = require('express');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

// GET /dashboard/kpis — tarjetas superiores del dashboard
router.get(
  '/kpis',
  asyncHandler(async (req, res) => {
    const [citasHoy, atendidasHoy, atendidasSemana, stockBajo, proximaCita] = await Promise.all([
      req.db.query("SELECT COUNT(*) FROM citas WHERE fecha_hora::date = CURRENT_DATE"),
      req.db.query(
        `SELECT COUNT(DISTINCT mascota_id) FROM historial_eventos_mascota
         WHERE tipo_evento IN ('consulta','tratamiento','vacuna','cirugia','examen')
           AND fecha::date = CURRENT_DATE`
      ),
      req.db.query(
        `SELECT COUNT(DISTINCT mascota_id) FROM historial_eventos_mascota
         WHERE tipo_evento IN ('consulta','tratamiento','vacuna','cirugia','examen')
           AND fecha >= date_trunc('week', CURRENT_DATE)`
      ),
      req.db.query("SELECT COUNT(*) FROM productos WHERE stock_actual <= stock_minimo AND estado = 'activo'"),
      req.db.query(
        `SELECT fecha_hora, m.nombre AS mascota FROM citas c JOIN mascotas m ON m.id = c.mascota_id
         WHERE fecha_hora >= NOW() AND estado NOT IN ('cancelada','no_asistio')
         ORDER BY fecha_hora LIMIT 1`
      ),
    ]);

    res.json({
      citas_agendadas_hoy: Number(citasHoy.rows[0].count),
      atendidas_hoy: Number(atendidasHoy.rows[0].count),
      atendidas_semana: Number(atendidasSemana.rows[0].count),
      stock_bajo: Number(stockBajo.rows[0].count),
      proxima_cita: proximaCita.rows[0] || null,
    });
  })
);

// GET /dashboard/mascotas-atendidas?periodo=diario|semanal|mensual
router.get(
  '/mascotas-atendidas',
  asyncHandler(async (req, res) => {
    const periodo = req.query.periodo || 'diario';

    let query;
    if (periodo === 'diario') {
      query = `SELECT to_char(fecha, 'HH24:00') AS etiqueta, COUNT(DISTINCT mascota_id) AS total
               FROM historial_eventos_mascota
               WHERE tipo_evento IN ('consulta','tratamiento','vacuna','cirugia','examen') AND fecha::date = CURRENT_DATE
               GROUP BY 1 ORDER BY 1`;
    } else if (periodo === 'semanal') {
      query = `SELECT to_char(fecha, 'Dy') AS etiqueta, COUNT(DISTINCT mascota_id) AS total
               FROM historial_eventos_mascota
               WHERE tipo_evento IN ('consulta','tratamiento','vacuna','cirugia','examen') AND fecha >= date_trunc('week', CURRENT_DATE)
               GROUP BY 1, date_trunc('day', fecha) ORDER BY date_trunc('day', fecha)`;
    } else {
      query = `SELECT 'Semana ' || to_char(fecha, 'W') AS etiqueta, COUNT(DISTINCT mascota_id) AS total
               FROM historial_eventos_mascota
               WHERE tipo_evento IN ('consulta','tratamiento','vacuna','cirugia','examen') AND fecha >= date_trunc('month', CURRENT_DATE)
               GROUP BY 1 ORDER BY 1`;
    }

    const { rows } = await req.db.query(query);
    res.json(rows.map((r) => ({ etiqueta: r.etiqueta, total: Number(r.total) })));
  })
);

// GET /dashboard/proximas-citas
router.get(
  '/proximas-citas',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT c.fecha_hora, c.tipo_cita, c.estado, m.nombre AS mascota, cl.nombres AS cliente
       FROM citas c
       JOIN mascotas m ON m.id = c.mascota_id
       JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.fecha_hora::date = CURRENT_DATE AND c.estado NOT IN ('cancelada')
       ORDER BY c.fecha_hora LIMIT 8`
    );
    res.json(rows);
  })
);

// GET /dashboard/alertas
router.get(
  '/alertas',
  asyncHandler(async (req, res) => {
    const [stock, facturasVencidas, proformasPorVencer] = await Promise.all([
      req.db.query(
        `SELECT nombre, stock_actual, stock_minimo FROM productos
         WHERE stock_actual <= stock_minimo AND estado = 'activo' LIMIT 5`
      ),
      req.db.query(
        `SELECT f.id, f.secuencial, f.total, c.nombres FROM cuentas_por_cobrar cxc
         JOIN facturas f ON f.id = cxc.factura_id
         JOIN clientes c ON c.id = cxc.cliente_id
         WHERE cxc.estado = 'pendiente' AND cxc.fecha_vencimiento < CURRENT_DATE LIMIT 5`
      ),
      req.db.query(
        `SELECT id, numero, total, fecha_validez FROM proformas
         WHERE estado = 'pendiente' AND fecha_validez BETWEEN CURRENT_DATE AND CURRENT_DATE + 3 LIMIT 5`
      ),
    ]);
    res.json({
      stock_bajo: stock.rows,
      facturas_vencidas: facturasVencidas.rows,
      proformas_por_vencer: proformasPorVencer.rows,
    });
  })
);

// GET /dashboard/carga-doctores
router.get(
  '/carga-doctores',
  asyncHandler(async (req, res) => {
    const { rows } = await req.db.query(
      `SELECT u.nombres, u.apellidos, COUNT(c.id) AS atendidas
       FROM empleados e
       JOIN usuarios u ON u.id = e.usuario_id
       LEFT JOIN citas c ON c.empleado_id = e.id AND c.fecha_hora::date = CURRENT_DATE AND c.estado = 'atendida'
       WHERE e.tipo_empleado = 'doctor' AND e.estado = 'activo'
       GROUP BY u.id, u.nombres, u.apellidos
       ORDER BY atendidas DESC`
    );
    res.json(rows.map((r) => ({ ...r, atendidas: Number(r.atendidas) })));
  })
);

module.exports = router;
