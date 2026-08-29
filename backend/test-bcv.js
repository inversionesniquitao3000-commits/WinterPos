import https from 'https';

function fetchDirectBCV() {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const req = https.get(
      'https://www.bcv.org.ve/',
      {
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 6000
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const dolarRegex = /id="dolar"[^]*?<strong[^>]*?>\s*([\d,.]+)\s*<\/strong>/i;
            const euroRegex = /id="euro"[^]*?<strong[^>]*?>\s*([\d,.]+)\s*<\/strong>/i;
            const fechaRegex = /class="date-display-single"[^]*?>\s*([^<]+?)\s*<\/span>/i;

            const dolarMatch = data.match(dolarRegex);
            const euroMatch = data.match(euroRegex);
            const fechaMatch = data.match(fechaRegex);

            if (dolarMatch) {
              const usdVal = parseFloat(dolarMatch[1].replace(',', '.').trim());
              const eurVal = euroMatch ? parseFloat(euroMatch[1].replace(',', '.').trim()) : (usdVal * 1.08);
              const fechaValor = fechaMatch ? fechaMatch[1].replace(/\s+/g, ' ').trim() : 'Al día';

              return resolve({
                success: true,
                usd: usdVal.toFixed(4),
                eur: eurVal.toFixed(4),
                fechaValor,
                fuente: 'BCV Oficial Directo'
              });
            }
            reject(new Error('Regex did not match'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

fetchDirectBCV().then(console.log).catch(console.error);

