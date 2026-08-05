require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler.middleware');

const app = express();

// Railway (y la mayoría de PaaS) ponen la app detrás de un proxy que agrega
// X-Forwarded-For. Sin esto, express-rate-limit lanza un error de validación
// en cada request real y las peticiones se quedan colgadas sin respuesta.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/v1', routes);

app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }));
app.use(errorHandler);

module.exports = app;
