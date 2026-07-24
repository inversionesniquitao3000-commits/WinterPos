import https from 'https';
import fs from 'fs';

const agent = new https.Agent({
  rejectUnauthorized: false
});

console.log("Fetching https://www.bcv.org.ve/ ...");
const req = https.get('https://www.bcv.org.ve/', { agent, timeout: 8000 }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("Response status code:", res.statusCode);
    fs.writeFileSync('bcv_dump.html', data);
    console.log("Saved bcv_dump.html. Length:", data.length);
    
    // Test regexes
    const dolarRegex = /id="dolar"[^]*?<strong[^>]*?>\s*([\d,.]+)\s*<\/strong>/i;
    const euroRegex = /id="euro"[^]*?<strong[^>]*?>\s*([\d,.]+)\s*<\/strong>/i;
    const fechaRegex = /class="date-display-single"[^]*?>\s*([^<]+?)\s*<\/span>/i;

    const dolarMatch = data.match(dolarRegex);
    const euroMatch = data.match(euroRegex);
    const fechaMatch = data.match(fechaRegex);
    
    console.log("dolarMatch:", dolarMatch ? dolarMatch[1] : 'null');
    console.log("euroMatch:", euroMatch ? euroMatch[1] : 'null');
    console.log("fechaMatch:", fechaMatch ? fechaMatch[1] : 'null');
    
    const secondaryFechaRegex = /Fecha Valor:[^]*?<strong>\s*([^<]+?)\s*<\/strong>/i;
    const secondaryMatch = data.match(secondaryFechaRegex);
    console.log("secondaryMatch:", secondaryMatch ? secondaryMatch[1] : 'null');
  });
});

req.on('error', (err) => {
  console.error("Error fetching BCV:", err);
});
