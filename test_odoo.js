const url = 'https://bot-odoo.2fsywk.easypanel.host/jsonrpc';

async function rpc(method, params) {
  const req = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: Math.floor(Math.random() * 1000)
    })
  });
  const json = await req.json();
  if (json.error) console.error(json.error);
  require('fs').writeFileSync('odoo_output.json', JSON.stringify(json.result || json, null, 2));
}

async function test() {
  const params = {
    service: 'object',
    method: 'execute_kw',
    args: [
      'odoo_akallpav1',
      2,
      '17559361103f09dc64981df50b5a6dcebdf608b7',
      'hr.attendance',
      'search_read',
      [[['employee_id', '=', 4]]],
      { 
        limit: 1,
        order: 'id desc'
      }
    ]
  };
  
  await rpc('call', params);
}
test();
