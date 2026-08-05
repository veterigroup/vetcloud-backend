/**
 * Manejador de errores centralizado. Traduce errores comunes de Postgres
 * a respuestas HTTP claras, sin filtrar detalles internos al cliente.
 */
function errorHandler(err, req, res, next) {
  console.error(err);

  // Violación de FK / NOT NULL / UNIQUE de Postgres
  if (err.code === '23505') {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Ya existe un registro con ese valor único' } });
  }
  if (err.code === '23503') {
    return res.status(409).json({ error: { code: 'FK_VIOLATION', message: 'La operación viola una relación existente' } });
  }
  if (err.code === '23502') {
    return res.status(400).json({ error: { code: 'NOT_NULL', message: 'Falta un campo obligatorio' } });
  }
  // RLS bloqueó la operación (row no visible / WITH CHECK falló)
  if (err.code === '42501') {
    return res.status(403).json({ error: { code: 'RLS_DENIED', message: 'No tienes acceso a este recurso' } });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: status === 500 ? 'Error interno del servidor' : err.message,
    },
  });
}

module.exports = { errorHandler };
