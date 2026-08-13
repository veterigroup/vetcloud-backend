/** Evita try/catch repetido en cada ruta async — reenvía errores a errorHandler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Fragmento SQL que resuelve la zona horaria del tenant actual (columna
 * tenants.timezone), usando el mismo app.current_tenant_id que ya fija
 * tenantContext para RLS. Se usa así: `NOW() AT TIME ZONE ${TENANT_TZ_SQL}`.
 * Si el tenant no tiene timezone configurada, cae a 'America/Guayaquil'.
 */
const TENANT_TZ_SQL = `COALESCE(
  (SELECT timezone FROM tenants WHERE id = current_setting('app.current_tenant_id', true)::bigint),
  'America/Guayaquil'
)`;

/** Lee page/per_page de la query string con límites sensatos. */
function getPagination(req) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(req.query.per_page, 10) || 20, 1), 100);
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
}

function paginatedResponse(rows, total, { page, perPage }) {
  return {
    data: rows,
    pagination: { page, per_page: perPage, total: Number(total), total_pages: Math.ceil(total / perPage) },
  };
}

module.exports = { asyncHandler, getPagination, paginatedResponse, TENANT_TZ_SQL };
