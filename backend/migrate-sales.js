import { restoreSalesToPostgres, restoreCierresToPostgres, restoreAbonosToPostgres, restoreTasasToPostgres, restoreMovementsToPostgres, readJsonFile } from './db-store.js';

async function main() {
  console.log('🚀 Iniciando migración directa a PostgreSQL...');
  const sales = readJsonFile('sales.json', []);
  const cierres = readJsonFile('cierres.json', []);
  const abonos = readJsonFile('abonos.json', []);
  const tasas = readJsonFile('tasas.json', []);
  const movements = readJsonFile('movements.json', []);

  console.log(`📊 Encontrados: ${sales.length} ventas, ${cierres.length} cierres, ${abonos.length} abonos, ${tasas.length} tasas, ${movements.length} movimientos de Kardex.`);

  if (cierres.length > 0) {
    console.log('⏳ Restaurando cierres...');
    await restoreCierresToPostgres(cierres);
  }
  if (sales.length > 0) {
    console.log('⏳ Restaurando ventas y transacciones...');
    await restoreSalesToPostgres(sales);
  }
  if (abonos.length > 0) {
    console.log('⏳ Restaurando abonos...');
    await restoreAbonosToPostgres(abonos);
  }
  if (tasas.length > 0) {
    console.log('⏳ Restaurando tasas...');
    await restoreTasasToPostgres(tasas);
  }
  if (movements.length > 0) {
    console.log('⏳ Restaurando movimientos de Kardex...');
    await restoreMovementsToPostgres(movements);
  }

  console.log('🎉 ¡Migración a PostgreSQL completada con éxito total!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error durante migración:', err);
  process.exit(1);
});
