import { restoreSalesToPostgres, restoreCierresToPostgres, restoreAbonosToPostgres, restoreTasasToPostgres, readJsonFile } from './db-store.js';

async function main() {
  console.log('🚀 Iniciando migración directa a PostgreSQL...');
  const sales = readJsonFile('sales.json', []);
  const cierres = readJsonFile('cierres.json', []);
  const abonos = readJsonFile('abonos.json', []);
  const tasas = readJsonFile('tasas.json', []);

  console.log(`📊 Encontrados: ${sales.length} ventas, ${cierres.length} cierres, ${abonos.length} abonos, ${tasas.length} tasas.`);

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

  console.log('🎉 ¡Migración a PostgreSQL completada con éxito total!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error durante migración:', err);
  process.exit(1);
});
