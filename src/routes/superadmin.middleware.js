/**
 * Solo para rutas /superadmin/* — exige rol superadmin.
 * El aislamiento de datos cross-tenant ya lo permite RLS via is_superadmin(),
 * esto es la puerta de entrada al módulo.
 */
function requireSuperadmin(req, res, next) {
  if (!req.user.isSuperadmin) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Solo el superadministrador puede acceder a este módulo' },
    });
  }
  next();
}

module.exports = { requireSuperadmin };
