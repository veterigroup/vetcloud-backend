const { pool } = require('../config/db');

/**
 * Abre una transacción por request, fija app.current_tenant_id / app.is_superadmin
 * con SET LOCAL (vive solo dentro de esta transacción) y adjunta req.db.
 *
 * A partir de aquí, ninguna query de la app necesita "WHERE tenant_id = ...":
 * Postgres ya filtra solo gracias a las políticas RLS creadas en Supabase.
 */
async function tenantContext(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true), set_config($3, $4, true)', [
      'app.current_tenant_id',
      req.user.tenantId ? String(req.user.tenantId) : '',
      'app.is_superadmin',
      String(req.user.isSuperadmin),
    ]);

    req.db = client;

    res.on('finish', async () => {
      try {
        await client.query(res.statusCode >= 400 ? 'ROLLBACK' : 'COMMIT');
      } catch (e) {
        console.error('Error cerrando transacción:', e);
      } finally {
        client.release();
      }
    });

    next();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    next(err);
  }
}

module.exports = { tenantContext };
