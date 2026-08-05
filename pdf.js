const PDFDocument = require('pdfkit');
const https = require('https');
const http = require('http');

// ═══════════════════════════════════════════════
// 承诺书 PDF 生成模块
// ═══════════════════════════════════════════════

const TITLE = '承诺书';

// 承诺书正文（模板原文）
const SALUTATION = '尊敬的大源公司各位领导：我将进入大源厂区办理业务。';

const PROMISE_LINES = [
  '我承诺，不在厂区和周边 50 米内吸烟；不动用明火；',
  '我承诺，文明驾驶，不在厂区鸣笛，不随意停靠穿行；',
  '我承诺，不在厂区和周边随意丢垃圾和倾倒污水；',
  '我承诺，进入厂区，着装整齐，不赤膊，不穿拖鞋；',
  '我承诺，不带孩子进入厂区，未经许可，我绝对不进入大源车间和办公区；',
  '我承诺，行为举止文明，不污言秽语，完全服从大源各位领导的安排和管理；',
  '我承诺，爱护大源的公共设施，如有损坏，照价赔偿；',
  '我承诺，进入大源公司客户厂区，同样遵守如上承诺，并且完全服从各项管理；',
  '我承诺，装货完毕后尽快驶出大源厂区范围内，车辆如需在厂区内防护，自行解决，出现安全问题，后果自负。',
];

const COPY_LINE = '以下，请司机师傅抄写：我完全遵守如上承诺!';
const COPY_HINT = '（不许丢字和错别字，不许遗漏标点）';

const SIGN_HEADER = '以下，请库管和装卸队负责人填写：';
const SIGN_CONFIRM = '同意开始办理业务：负责人签字：';
const SIGN_DONE = '业务办理完毕，司机无违章违纪行为：负责人签字：';

/**
 * 下载文件内容（用于获取签名图片）
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https') ? https : http;
    transport.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// 中文字体路径
function findChineseFont() {
  const candidates = [
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/usr/share/fonts/truetype/arphic/uming.ttc',
    '/app/fonts/simhei.ttf',
    '/app/fonts/SimHei.ttf',
    '/app/fonts/NotoSansCJK-Regular.ttc',
  ];
  const fs = require('fs');
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 在文档底部画一条水平线（供签字/抄写使用）
function drawLine(doc, y) {
  doc.moveTo(doc.page.margins.left, y).lineTo(
    doc.page.width - doc.page.margins.right, y
  ).strokeColor('#000').lineWidth(0.8).stroke();
}

/**
 * 生成承诺书 PDF
 * @param {Object} order 运输记录 { name, carType, signImg, ... }
 * @param {Buffer|null} signBuffer 签名图片二进制（可为 null）
 * @returns {Promise<Buffer>}
 */
async function generatePromisePdf(order, signBuffer) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 64, right: 64 },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fontPath = findChineseFont();
    if (fontPath) {
      doc.registerFont('Chinese', fontPath);
    } else {
      console.warn('[pdf] 未找到中文字体，中文可能无法正常显示');
    }
    const font = fontPath ? 'Chinese' : 'Helvetica';

    // ─── 标题 ───
    doc.font(font).fontSize(20).fillColor('#000').text(TITLE, { align: 'center' });
    doc.moveDown(1.2);

    // ─── 称呼 ───
    doc.fontSize(12).text(SALUTATION, { align: 'left', lineGap: 4 });
    doc.moveDown(0.6);

    // ─── 承诺正文 ───
    for (const line of PROMISE_LINES) {
      doc.fontSize(12).text(line, { align: 'left', lineGap: 4 });
      doc.moveDown(0.35);
    }

    // ─── 抄写部分 ───
    doc.moveDown(0.8);
    doc.fontSize(12).text(COPY_LINE, { align: 'left' });
    doc.fontSize(10).fillColor('#666').text(COPY_HINT, { align: 'left' });
    doc.fillColor('#000').moveDown(0.4);
    drawLine(doc, doc.y + 8); // 抄写横线

    // ─── 签字区 ───
    doc.moveDown(2.2);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    // 车牌号（默认空）
    const plateNo = order.carType || '';

    doc.fontSize(12);
    // 承诺人签字 + 签名图 + 车牌号 + 日期 排在一行
    const signText = `承诺人签字：        车牌号：${plateNo}        日期：${year}年${month}月${day}日`;

    // 计算签名图放在"承诺人签字："后面
    const signLabelWidth = doc.widthOfString('承诺人签字：');
    const signX = doc.page.margins.left + signLabelWidth;
    const signY = doc.y;

    if (signBuffer) {
      try {
        // 先放签名图，再画文字说明
        const imgH = 36;
        doc.image(signBuffer, signX, signY - 6, { width: 80, height: imgH, fit: [80, imgH] });
        // 图片下方补车牌号和日期行
        doc.moveDown(1.6);
        doc.fontSize(12).text(`车牌号：${plateNo}`, { align: 'left', continued: true });
        doc.text(`        日期：${year}年${month}月${day}日`);
      } catch (e) {
        console.error('[pdf] 签名图插入失败:', e.message);
        doc.fontSize(12).text(signText, { align: 'left' });
      }
    } else {
      doc.fontSize(12).text(signText, { align: 'left' });
    }

    // ─── 库管/装卸队负责人部分 ───
    doc.moveDown(1.5);
    doc.fontSize(12).text(SIGN_HEADER, { align: 'left' });
    doc.moveDown(0.5);
    doc.text(SIGN_CONFIRM, { align: 'left' });
    doc.moveDown(1.5);
    drawLine(doc, doc.y + 4);

    doc.moveDown(2.2);
    doc.text(SIGN_DONE, { align: 'left' });
    doc.moveDown(1.5);
    drawLine(doc, doc.y + 4);

    doc.end();
  });
}

module.exports = {
  generatePromisePdf,
  downloadFile,
};
