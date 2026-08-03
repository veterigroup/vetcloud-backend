const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { tenantContext } = require('../middleware/tenant.middleware');

const authRoutes = require('./auth.routes');
const usuariosRoutes = require('./usuarios.routes');
const rolesRoutes = require('./roles.routes');
const catalogosRoutes = require('./catalogos.routes');
const clientesRoutes = require('./clientes.routes');
const mascotasRoutes = require('./mascotas.routes');
const citasRoutes = require('./citas.routes');
const consultasRoutes = require('./consultas.routes');
const inventarioRoutes = require('./inventario.routes');
const proformasRoutes = require('./proformas.routes');
const facturasRoutes = require('./facturas.routes');
const cajaRoutes = require('./caja.routes');
const dashboardRoutes = require('./dashboard.routes');

const router = express.Router();

// /auth/* no requiere tenantContext todavía (login define el tenant)
router.use('/auth', authRoutes);

// Todo lo demás: primero autentica el JWT, luego abre el contexto RLS
router.use(authenticate, tenantContext);

router.use('/clientes', clientesRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/roles', rolesRoutes);
router.use(catalogosRoutes); // expone /especies y /razas directamente
router.use('/mascotas', mascotasRoutes);
router.use('/citas', citasRoutes);
router.use('/consultas', consultasRoutes);
router.use('/productos', inventarioRoutes);
router.use('/proformas', proformasRoutes);
router.use('/facturas', facturasRoutes);
router.use('/caja', cajaRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
