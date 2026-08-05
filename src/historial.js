const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`VetCloud backend escuchando en http://localhost:${PORT}`);
  console.log(`API base: http://localhost:${PORT}/api/v1`);
});
