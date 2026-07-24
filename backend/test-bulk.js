import pg from 'pg';
import dotenv from 'dotenv';
import { updateProductPricesBulk, savePriceHistory } from './db-store.js';

dotenv.config();

async function runTest() {
  console.log("Starting bulk price update database test...");
  try {
    const mockUpdates = [
      { id: 1, cost: 1.0, detail: 2.0, mayor: 1.5 }
    ];
    const success = await updateProductPricesBulk(mockUpdates);
    console.log("updateProductPricesBulk result:", success);
    
    const mockLog = {
      productCode: '51842',
      priceType: 'Costo',
      oldPrice: 1.1,
      newPrice: 1.2,
      motivo: 'Test Motivo'
    };
    const logResult = await savePriceHistory(mockLog);
    console.log("savePriceHistory result:", logResult);
  } catch (err) {
    console.error("CRITICAL ERROR IN DB TEST:", err);
  }
}

runTest();
