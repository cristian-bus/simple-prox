const https = require('https');

const payload = JSON.stringify({
  events: [
    {
      eventId: 'spx_test_evt_001',
      campaignId: '00000000-0000-4000-a000-000000000001',
      eventType: 'impression',
      timestamp: new Date().toISOString()
    },
    {
      eventId: 'spx_test_evt_002',
      campaignId: '00000000-0000-4000-a000-000000000001',
      eventType: 'whatsapp_click',
      timestamp: new Date().toISOString()
    }
  ]
});

const token = 'spx_term_controlled_token_fase4_test';
const terminalId = 'spx_test_terminal_controlled_2026';

const options = {
  hostname: 'qtixbiikhvhzwshfgyeo.supabase.co',
  port: 443,
  path: '/functions/v1/terminal-sync/events',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'x-terminal-id': terminalId,
    'x-terminal-token': token
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('HTTP_STATUS:', res.statusCode);
      console.log('RESPONSE_SUCCESS:', parsed.success);
      console.log('PROCESSED_COUNT:', parsed.processedCount);
      console.log('INSTALLATION_ID:', parsed.installationId);
    } catch (e) {
      console.log('HTTP_STATUS:', res.statusCode);
      console.log('RAW_BODY:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('REQUEST_ERROR:', e.message);
});

req.write(payload);
req.end();
