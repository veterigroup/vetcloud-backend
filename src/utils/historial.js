/**
 * Registra un evento en historial_eventos_mascota (línea de tiempo unificada).
 * Se llama dentro de la misma transacción del request (req.db) para que,
 * si algo falla después, el evento también se revierta.
 */
async function registrarHistorial(db, { tenantId, mascotaId, tipo, tabla, refId, titulo, descripcion, empleadoId }) {
  await db.query(
    `INSERT INTO historial_eventos_mascota
     (tenant_id, mascota_id, tipo_evento, referencia_tabla, referencia_id, titulo, descripcion, empleado_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tenantId, mascotaId, tipo, tabla, refId, titulo, descripcion, empleadoId]
  );
}

module.exports = { registrarHistorial };
