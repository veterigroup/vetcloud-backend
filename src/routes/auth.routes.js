const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();

function signToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, tenant_id: usuario.tenant_id, rol: usuario.rol_nombre },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// POST /auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'email y password son requeridos' } });
    }

    // Consulta directa sin contexto de tenant todavía (el login es lo que define el tenant).
    // Se conecta con un cliente aparte, fuera de RLS de aplicación, solo para validar credenciales.
    const { rows } = await pool.query(
      `SELECT u.id, u.tenant_id, u.password_hash, u.estado, u.nombres, u.apellidos, r.nombre AS rol_nombre
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.email = $1`,
      [email]
    );

    const usuario = rows[0];
    if (!usuario || usuario.estado !== 'activo') {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } });
    }

    const valido = await bcrypt.compare(password, usuario.password_hash);
    if (!valido) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } });
    }

    await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1', [usuario.id]);

    const token = signToken(usuario);
    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        rol: usuario.rol_nombre,
        tenant_id: usuario.tenant_id,
      },
    });
  })
);

// GET /auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombres, u.apellidos, u.email, r.nombre AS rol, t.nombre_comercial, e.id AS empleado_id
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN empleados e ON e.usuario_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } });
    res.json(rows[0]);
  })
);

// POST /auth/refresh — reemite el token si el actual sigue siendo válido
router.post('/refresh', authenticate, (req, res) => {
  const token = jwt.sign(
    { sub: req.user.id, tenant_id: req.user.tenantId, rol: req.user.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  res.json({ token });
});

module.exports = router;
