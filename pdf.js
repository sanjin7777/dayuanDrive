const PDFDocument = require('pdfkit');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════
// 承诺书 PDF 生成模块（按 承诺书-大源厂区-20241015.docx 排版）
// ═══════════════════════════════════════════════

const TITLE = '承诺书';
const LOGO_PATH = path.join(__dirname, 'images', 'logo.png');

const SALUTATION = '尊敬的大源公司各位领导：  我将进入大源厂区办理业务。';

const PROMISE_LINES = [
  '我承诺，不在厂区和周边50米内吸烟；不动用明火；',
  '我承诺，文明驾驶，不在厂区鸣笛，不随意停靠穿行；',
  '我承诺，不在厂区和周边随意丢垃圾和倾倒污水；',
  '我承诺，进入厂区，着装整齐，不赤膊，不穿拖鞋；',
  '我承诺，不带孩子进入厂区，未经许可，我绝对不进入大源车间和办公区；',
  '我承诺，行为举止文明，不污言秽语，完全服从大源各位领导的安排和管理；',
  '我承诺，爱护大源的公共设施，如有损坏，照价赔偿；',
  '我承诺，进入大源公司客户厂区，同样遵守如上承诺，并且完全服从各项管理；',
  '我承诺, 装货完毕后尽快驶出大源厂区范围内，车辆如需在厂区内防护，自行解决，出现安全问题，后果自负。',
];

const RED_LINE_INDEX = 8;

// Word 半磅 → PDF 磅：标题 sz=44→22，正文默认 sz=21→10.5，字段 sz=24→12
const SIZE_TITLE = 22;
const SIZE_BODY = 10.5;
const SIZE_FIELD = 12;

/**
 * 下载文件内容（用于获取签名图片）
 * @param {string} url
 * @param {number} timeout 超时ms，默认10秒
 * @returns {Promise<Buffer>}
 */
function downloadFile(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https') ? https : http;
    const req = transport.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, timeout).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy(new Error('下载超时'));
    });
  });
}

function findChineseFont() {
  const bundled = path.join(__dirname, 'fonts', 'msyh_regular.ttf');
  const candidates = [
    bundled,
    '/app/fonts/msyh_regular.ttf',
    '/app/fonts/NotoSansCJKsc-Regular.otf',
    '/app/fonts/simhei.ttf',
    '/app/fonts/SimHei.ttf',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/usr/share/fonts/truetype/arphic/uming.ttc',
    '/app/fonts/NotoSansCJK-Regular.ttc',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) { /* ignore */ }
  }
  return null;
}

function findChineseBoldFont() {
  const bundled = path.join(__dirname, 'fonts', 'msyh_bold.ttf');
  const candidates = [
    bundled,
    '/app/fonts/msyh_bold.ttf',
    '/app/fonts/NotoSansCJKsc-Bold.otf',
    '/app/fonts/simhei.ttf',
    '/app/fonts/SimHei.ttf',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) { /* ignore */ }
  }
  return null;
}

/**
 * 生成承诺书 PDF
 * @param {Object} order 运输记录 { name, phone, carType, signImg, ... }
 * @param {Buffer|null} signBuffer 签名图片二进制（可为 null）
 * @returns {Promise<Buffer>}
 */
async function generatePromisePdf(order, signBuffer) {
  return new Promise((resolve, reject) => {
    // docx 页边距：上下 1440 twip=72pt，左右 1800 twip=90pt
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 72, bottom: 72, left: 90, right: 90 },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fontPath = findChineseFont();
    const boldFontPath = findChineseBoldFont();
    if (fontPath) {
      doc.registerFont('Chinese', fontPath);
    } else {
      console.warn('[pdf] 未找到中文字体，中文可能无法正常显示');
    }
    if (boldFontPath) {
      doc.registerFont('ChineseBold', boldFontPath);
    }
    const font = fontPath ? 'Chinese' : 'Helvetica';
    const fontBold = boldFontPath ? 'ChineseBold' : font;

    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ─── 页眉 Logo（docx 约 255pt × 17pt 横幅） ───
    const headerY = 40;
    if (fs.existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, left, headerY, { width: 255 });
      } catch (e) {
        console.warn('[pdf] 左上角图片加载失败:', e.message);
      }
    } else {
      console.warn('[pdf] 未找到左上角图片: ' + LOGO_PATH);
    }

    doc.x = left;
    doc.y = headerY + 28;
    doc.moveDown(1.0);

    // ─── 标题（二号加粗居中） ───
    doc.font(fontBold).fontSize(SIZE_TITLE).fillColor('#000').text(TITLE, {
      align: 'center',
      width: contentWidth,
    });
    doc.moveDown(1.0);

    // ─── 称呼 + 承诺正文（五号加粗；最后一条红色） ───
    const bodyOpts = { align: 'left', width: contentWidth, lineGap: 6 };

    doc.font(fontBold).fontSize(SIZE_BODY).fillColor('#000').text(SALUTATION, bodyOpts);
    doc.moveDown(0.7);

    for (let i = 0; i < PROMISE_LINES.length; i++) {
      const color = i === RED_LINE_INDEX ? '#FF0000' : '#000';
      doc.font(fontBold).fontSize(SIZE_BODY).fillColor(color).text(PROMISE_LINES[i], bodyOpts);
      doc.moveDown(0.65);
    }
    doc.fillColor('#000');

    // ─── 车牌号 / 手机号 / 日期 ───
    doc.moveDown(1.4);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const phone = (order && order.phone) || '';
    const plate = (order && (order.plateNo || order.carNo || order.carPlate)) || '';

    doc.font(fontBold).fontSize(SIZE_FIELD).fillColor('#000');
    const fieldY = doc.y;
    const col1 = left;
    const col2 = left + contentWidth * 0.34;
    const col3 = left + contentWidth * 0.66;

    doc.text(`车牌号：${plate}`, col1, fieldY, { lineBreak: false });
    doc.text(`手机号：${phone}`, col2, fieldY, { lineBreak: false });
    doc.text(`日期：${year}年${month}月${day}日`, col3, fieldY, { lineBreak: false });

    doc.x = left;
    doc.y = fieldY + SIZE_FIELD + 36;

    // ─── 签名（靠右） ───
    const signLabel = '签  名：';
    const signImgW = 160;
    const signImgH = 70;
    const right = doc.page.width - doc.page.margins.right;
    doc.font(fontBold).fontSize(SIZE_FIELD);
    const labelW = doc.widthOfString(signLabel);
    // 标签 + 签名图整体贴右：签名图右缘对齐右边距
    const signImgX = right - signImgW;
    const signLabelX = signImgX - labelW - 8;
    const signLabelY = doc.y;
    doc.text(signLabel, signLabelX, signLabelY, { lineBreak: false });

    if (signBuffer) {
      try {
        doc.image(signBuffer, signImgX, signLabelY - 20, {
          fit: [signImgW, signImgH],
        });
        doc.y = Math.max(doc.y, signLabelY + 60);
      } catch (e) {
        console.error('[pdf] 签名图插入失败:', e.message);
        doc.y = signLabelY + SIZE_FIELD + 40;
      }
    } else {
      doc.y = signLabelY + SIZE_FIELD + 50;
    }

    doc.end();
  });
}

module.exports = {
  generatePromisePdf,
  downloadFile,
};
