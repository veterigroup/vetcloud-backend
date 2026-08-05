/**
 * Descuenta stock de un producto y deja el rastro en movimientos_inventario.
 * Se usa cada vez que un tratamiento o vacuna aplicado consume un producto
 * del inventario — así el stock y el historial quedan siempre enlazados.
 */
async function descontarStock(db, { tenantId, productoId, cantidad, motivo, referenciaTabla, referenciaId, empleadoId }) {
  if (!productoId) return; // el tratamiento/vacuna no usó ningún producto del inventario

  await db.query(
    `INSERT INTO movimientos_inventario
      (tenant_id, producto_id, tipo_movimiento, cantidad, motivo, referencia_tabla, referencia_id, empleado_id)
     VALUES ($1,$2,'salida',$3,$4,$5,$6,$7)`,
    [tenantId, productoId, cantidad || 1, motivo, referenciaTabla, referenciaId, empleadoId]
  );

  await db.query('UPDATE productos SET stock_actual = stock_actual - $1 WHERE id = $2', [cantidad || 1, productoId]);
}

module.exports = { descontarStock };
