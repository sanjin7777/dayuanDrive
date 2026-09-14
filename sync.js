const https = require('https');
const http = require('http');

const EXTERNAL_CONFIG = {
  baseURL: 'http://120.133.64.124:8800',
  path: '/app/dsf/ppe/api/plugin/91321003MA1Y3JF036/api/transportation/saveTransportationInfo',
  timeout: 30000,
};

// MinIO 文件上传配置
const MINIO_CONFIG = {
  uploadPath: '/service/base/minio/api/upload',
  folderPath: '/ppe/TransportationInfo',
  timeout: 60000,
};

// 从接口返回中提取文件 URL（兼容多种返回结构）
function extractFileUrl(parsed) {
  if (!parsed) return '';
  if (typeof parsed === 'string') return parsed;
  const data = parsed.data !== undefined ? parsed.data : parsed;
  if (typeof data === 'string') return data;
  const candidates = [
    data.url, data.fileUrl, data.filePath, data.path, data.key, data.minioUrl,
    data.objectName, data.fileName
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c;
  }
  return '';
}

// 将二进制文件上传到第三方 MinIO 文件服务
function uploadToMinio(fileBuffer, fileName, contentType) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const url = new URL(EXTERNAL_CONFIG.baseURL + MINIO_CONFIG.uploadPath);

    // 构造 multipart/form-data 报文体
    const head = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="folderPath"\r\n\r\n' +
      MINIO_CONFIG.folderPath + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="multipartFiles"; filename="' + fileName + '"\r\n' +
      'Content-Type: ' + (contentType || 'image/png') + '\r\n\r\n',
      'utf-8'
    );
    const tail = Buffer.from('\r\n--' + boundary + '--\r\n', 'utf-8');
    const body = Buffer.concat([head, fileBuffer, tail]);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length,
      },
      timeout: MINIO_CONFIG.timeout,
    };

    console.log('[MinIO] 上传文件:', fileName, '大小:', fileBuffer.length, 'bytes');

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let resBody = '';
      res.on('data', (c) => resBody += c);
      res.on('end', () => {
        console.log('[MinIO] 响应状态码:', res.statusCode);
        console.log('[MinIO] 响应内容:', resBody);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('MinIO 上传失败，状态码 ' + res.statusCode + ': ' + resBody));
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(resBody);
        } catch (e) {
          resolve(resBody);
          return;
        }
        if (parsed && parsed.error) {
          reject(new Error('MinIO 上传业务失败: ' + JSON.stringify(parsed.error)));
          return;
        }
        resolve(extractFileUrl(parsed));
      });
    });

    req.on('error', (err) => {
      console.error('[MinIO] 请求错误:', err.message);
      reject(err);
    });
    req.on('timeout', () => {
      console.error('[MinIO] 上传超时');
      req.destroy(new Error('MinIO 上传超时'));
    });

    req.write(body);
    req.end();
  });
}

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

        // 响应体含 error 字段，视为业务失败
        if (parsed && parsed.error) {
          reject(new Error(`外部接口业务失败: ${JSON.stringify(parsed.error)}`));
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

// 将 arriveTime 规范化为 YYYY-MM-DD HH:mm:ss，兼容第三方接口的日期解析
function formatDateTime(str) {
  if (!str) return '';
  const m = String(str).match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!m) return str;
  const pad = (n) => String(n).padStart(2, '0');
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s || '00')}`;
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
    arriveTime: formatDateTime(transport.arriveTime),
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
  uploadToMinio,
};
