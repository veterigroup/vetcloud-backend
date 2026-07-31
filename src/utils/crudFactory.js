const express = require('express');
const { asyncHandler, getPagination, paginatedResponse } = require('./helpers');

/**
 * Genera un router CRUD estándar para una tabla tenant-scoped.
 * tenant_id se inyecta siempre desde req.user.tenantId — nunca desde el body.
 * RLS (Supabase) es la última línea de defensa si algo se escapara igual.
 *
 * @param {object} opts
 * @param {string} opts.table - nombre de la tabla
 * @param {string[]} opts.insertable - columnas permitidas en create/update
 * @param {string} [opts.orderBy] - columna de orden por defecto
 * @param {string[]} [opts.searchable] - columnas ILIKE para ?search=
 */
function crudRouter({ table, insertable, orderBy = 'id', searchable = [], filterable = [] }) {
  const router = express.Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { page, perPage, offset } = getPagination(req);
      const params = [];
      const conditions = [];

      if (req.query.search && searchable.length) {
        params.push(`%${req.query.search}%`);
        conditions.push(`(${searchable.map((c) => `${c} ILIKE $${params.length}`).join(' OR ')})`);
      }
      for (const col of filterable) {
        if (req.query[col] !== undefined) {
          params.push(req.query[col]);
          conditions.push(`${col} = $${params.length}`);
        }
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const { rows: countRows } = await req.db.query(`SELECT COUNT(*) FROM ${table} ${where}`, params);
      params.push(perPage, offset);
      const { rows } = await req.db.query(
        `SELECT * FROM ${table} ${where} ORDER BY ${orderBy} DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      res.json(paginatedResponse(rows, countRows[0].count, { page, perPage }));
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const { rows } = await req.db.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No encontrado' } });
      res.json(rows[0]);
    })
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const cols = insertable.filter((c) => req.body[c] !== undefined);
      const values = cols.map((c) => req.body[c]);
      cols.push('tenant_id');
      values.push(req.user.tenantId);

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await req.db.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      res.status(201).json(rows[0]);
    })
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const cols = insertable.filter((c) => req.body[c] !== undefined);
      if (!cols.length) return res.status(400).json({ error: { code: 'EMPTY_UPDATE', message: 'Nada que actualizar' } });

      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const values = cols.map((c) => req.body[c]);
      values.push(req.params.id);

      const { rows } = await req.db.query(
        `UPDATE ${table} SET ${setClause} WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No encontrado' } });
      res.json(rows[0]);
    })
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const { rowCount } = await req.db.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No encontrado' } });
      res.status(204).send();
    })
  );

  return router;
}

module.exports = { crudRouter };
