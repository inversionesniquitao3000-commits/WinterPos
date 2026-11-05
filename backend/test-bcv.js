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
              const cleanBcvNum = (val) => {
                if (!val) return 0;
                let s = String(val).trim();
                if (s.includes('.') && s.includes(',')) {
                  s = s.lastIndexOf('.') < s.lastIndexOf(',')
                    ? s.replace(/\./g, '').replace(',', '.')
                    : s.replace(/,/g, '');
                } else if (s.includes(',')) {
                  s = s.replace(/,/g, '.');
                }
                const n = parseFloat(s);
                return isNaN(n) ? 0 : n;
              };
              const usdVal = cleanBcvNum(dolarMatch[1]);
              const eurVal = euroMatch ? cleanBcvNum(euroMatch[1]) : (usdVal * 1.08);
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

