/**
 * Autorización por rol, según la matriz de acceso definida en api_endpoints.md.
 * El aislamiento de DATOS ya lo hace RLS; esto controla qué MÓDULOS puede
 * tocar cada rol (defensa en profundidad, no el único mecanismo).
 */
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (req.user.isSuperadmin) return next();
    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción' },
      });
    }
    next();
  };
}

module.exports = { requireRole };
