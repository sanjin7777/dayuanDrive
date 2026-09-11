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
    const startedAt = Date.now();

    // ─── 请求日志 ───
    console.log('[外部同步] 发起请求:', url.href);
    console.log('[外部同步] 请求参数:', payload);

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
        const cost = Date.now() - startedAt;
        console.log(`[外部同步] 响应状态码: ${res.statusCode}，耗时: ${cost}ms`);
        console.log('[外部同步] 响应内容:', body);

        // HTTP 状态码非 2xx，视为失败
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`外部接口返回状态码 ${res.statusCode}: ${body}`));
          return;
        }

        // 解析响应体
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          // 非 JSON 响应，直接返回原始文本
          resolve(body);
          return;
        }

        // 若有业务状态码字段，判断是否成功（兼容常见字段名）
        const bizCode = parsed.code !== undefined ? parsed.code
          : (parsed.success !== undefined ? (parsed.success ? 0 : 1) : undefined);
        if (bizCode !== undefined && Number(bizCode) !== 0 && parsed.success !== true) {
          reject(new Error(`外部接口业务失败: ${JSON.stringify(parsed)}`));
          return;
        }

        console.log('[外部同步] 调用成功');
        resolve(parsed);
      });
    });

    req.on('error', (err) => {
      console.error('[外部同步] 请求错误:', err.message);
      reject(err);
    });

    req.on('timeout', () => {
      console.error('[外部同步] 请求超时，超过', EXTERNAL_CONFIG.timeout, 'ms');
      req.destroy(new Error('外部接口请求超时'));
    });

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
  console.log('[外部同步] 同步新增记录 id=' + transport.id);
  return externalRequest(payload);
}

async function syncStatusChange(transport) {
  const payload = buildPayload(transport, true);
  console.log('[外部同步] 同步更新记录 id=' + transport.id);
  return externalRequest(payload);
}

module.exports = {
  syncTransport,
  syncStatusChange,
};
