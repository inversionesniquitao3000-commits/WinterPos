function numberToWordsEs(n: number): string {
  const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const tens = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  
  if (n === 0) return 'CERO';
  if (n < 10) return units[n];
  if (n >= 10 && n < 20) return teens[n - 10];
  
  const unitDigit = n % 10;
  const tenDigit = Math.floor(n / 10) % 10;
  const hundredDigit = Math.floor(n / 100) % 10;
  const thousandDigit = Math.floor(n / 1000);
  
  let words = '';
  
  if (thousandDigit > 0) {
    if (thousandDigit === 1) {
      words += 'MIL ';
    } else {
      words += numberToWordsEs(thousandDigit) + ' MIL ';
    }
  }
  
  if (hundredDigit > 0) {
    if (hundredDigit === 1) {
      words += (tenDigit === 0 && unitDigit === 0) ? 'CIEN ' : 'CIENTO ';
    } else if (hundredDigit === 5) {
      words += 'QUINIENTOS ';
    } else if (hundredDigit === 7) {
      words += 'SETECIENTOS ';
    } else if (hundredDigit === 9) {
      words += 'NOVECIENTOS ';
    } else {
      words += units[hundredDigit] + 'CIENTOS ';
    }
  }
  
  if (tenDigit > 0) {
    if (tenDigit === 2) {
      words += unitDigit === 0 ? 'VEINTE ' : 'VEINTI' + units[unitDigit] + ' ';
    } else {
      words += tens[tenDigit] + (unitDigit > 0 ? ' Y ' + units[unitDigit] : '') + ' ';
    }
  } else if (unitDigit > 0) {
    words += units[unitDigit] + ' ';
  }
  
  return words.trim();
}

export function formatNumberToWordsUSD(amount: number): string {
  const integerPart = Math.floor(amount);
  const centsPart = Math.round((amount - integerPart) * 100);
  
  const integerWords = numberToWordsEs(integerPart) || 'CERO';
  const centsFormatted = centsPart.toString().padStart(2, '0') + '/100';
  
  return `${integerWords} CON ${centsFormatted} DOLARES`;
}
