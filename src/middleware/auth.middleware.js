const jwt = require('jsonwebtoken');

/**
 * Verifica el JWT y adjunta req.user = { id, tenantId, rol, isSuperadmin }.
 * El tenant_id SIEMPRE viene del token, nunca de query params ni del body,
 * para que nadie pueda pedir datos de otra clínica cambiando un parámetro.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Token requerido' } });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.sub,
      tenantId: payload.tenant_id ?? null,
      rol: payload.rol,
      isSuperadmin: payload.rol === 'superadmin',
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token inválido o expirado' } });
  }
}

module.exports = { authenticate };
