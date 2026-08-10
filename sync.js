const https = require('https');
const http = require('http');

const EXTERNAL_CONFIG = {
  baseURL: 'http://120.133.64.124:8800',
  path: '/app/dsf/ppe/api/plugin/91321003MA1Y3JF036/api/transportation/saveTransportationInfo',
  timeout: 30000,
};

function externalRequest(data) {
  return new Promise((resolve, reject) => {
    const url = new URL(EXTERNAL_CONFIG.baseURL + EXTERNAL_CONFIG.path);
    const payload = JSON.stringify(data);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: EXTERNAL_CONFIG.timeout,
    };
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(payload);
    req.end();
  });
}

function buildPayload(transport, isUpdate) {
  const payload = {
    type: transport.type,
    name: transport.name,
    idcard: transport.idcard,
    phone: transport.phone,
    carType: transport.carType,
    plateNo: transport.plateNo || '',
    tonnage: transport.tonnage || 0,
    startAddr: transport.startAddr,
    destAddr: transport.destAddr,
    factoryAddr: transport.factoryAddr,
    arriveTime: transport.arriveTime,
    status: transport.status,
    signImg: transport.signImg || '',
    openid: transport.openid || '',
  };

  if (isUpdate) {
    payload.id = transport.id;
    payload.rowStatus = 3;
  } else {
    payload.rowStatus = 1;
  }

  return payload;
}

async function syncTransport(transport) {
  const payload = buildPayload(transport, false);
  return externalRequest(payload);
}

async function syncStatusChange(transport) {
  const payload = buildPayload(transport, true);
  return externalRequest(payload);
}

module.exports = {
  syncTransport,
  syncStatusChange,
};
