const PDFDocument = require('pdfkit');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════
// 承诺书 PDF 生成模块
// ═══════════════════════════════════════════════

const TITLE = '承诺书';
const DOC_CODE = 'GY-Y-JL-007'; // 右上角文件编号
const LOGO_PATH = path.join(__dirname, 'images', 'logo.png'); // 左上角图片

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

// 需要红色显示的最后一条
const RED_LINE_INDEX = 8;

const COPY_LINE = '以下，请司机师傅抄写：我完全遵守如上承诺!';
const COPY_HINT = '（不许丢字和错别字，不许遗漏标点）';
const COPY_EMPHASIS = '我完全遵守如上承诺!'; // 需要加粗的部分

const SIGN_HEADER = '以下，请库管和装卸队负责人填写：';
const SIGN_CONFIRM = '同意开始办理业务： 负责人签字：';
const SIGN_DONE = '业务办理完毕，司机无违章违纪行为：  负责人签字：';

// 中文字号对应磅值
const SIZE_ER = 22;    // 二号
const SIZE_SAN = 16;   // 三号
const SIZE_WU = 10.5;  // 五号
const SIZE_XIAO_WU = 9; // 小五

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

// 中文字体路径（优先使用项目内打包的微软雅黑，其次备用字体）
function findChineseFont() {
  // 项目内打包的字体（本地开发与容器通用，基于 __dirname 定位）
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

// 中文字体粗体路径
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

    // ─── 页眉：左上角图片 + 右上角编号 ───
    const headerY = doc.page.margins.top - 40;

    // 左上角图片（只给宽度，高度自动按比例，拉长图片）
    if (fs.existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, doc.page.margins.left, headerY, {
          width: 220,
        });
      } catch (e) {
        console.warn('[pdf] 左上角图片加载失败:', e.message);
      }
    } else {
      console.warn('[pdf] 未找到左上角图片: ' + LOGO_PATH);
    }

    // 右上角编号（小五字号，绝对定位绘制，不改变后续布局）
    doc.font(font).fontSize(SIZE_XIAO_WU).fillColor('#000').text(
      DOC_CODE,
      doc.page.width - doc.page.margins.right - doc.widthOfString(DOC_CODE),
      headerY,
      { lineBreak: false }
    );

    // 重置光标到左上角，开始正文（避免正文被页眉挤到右侧）
    doc.x = doc.page.margins.left;
    doc.y = headerY + 46;
    doc.moveDown(1.2);

    // ─── 标题（二号加粗） ───
    doc.font(fontBold).fontSize(SIZE_ER).fillColor('#000').text(TITLE, { align: 'center' });
    doc.moveDown(1.2);

    // ─── 称呼（五号） ───
    doc.font(font).fontSize(SIZE_WU).text(SALUTATION, { align: 'left', lineGap: 4 });
    doc.moveDown(0.6);

    // ─── 承诺正文（五号，最后一条红色） ───
    for (let i = 0; i < PROMISE_LINES.length; i++) {
      if (i === RED_LINE_INDEX) {
        doc.font(font).fontSize(SIZE_WU).fillColor('#e60000').text(PROMISE_LINES[i], { align: 'left', lineGap: 4 });
      } else {
        doc.font(font).fontSize(SIZE_WU).fillColor('#000').text(PROMISE_LINES[i], { align: 'left', lineGap: 4 });
      }
      doc.moveDown(0.35);
    }
    doc.fillColor('#000');

    // ─── 抄写部分 ───
    doc.moveDown(0.8);
    // "以下，请司机师傅抄写：" 五号普通字体
    doc.font(font).fontSize(SIZE_WU).fillColor('#000').text(
      COPY_LINE.replace(COPY_EMPHASIS, ''),
      { align: 'left', continued: true }
    );
    // "我完全遵守如上承诺!" 三号加粗
    doc.font(fontBold).fontSize(SIZE_SAN).text(COPY_EMPHASIS);
    // 提示文字五号
    doc.font(font).fontSize(SIZE_WU).fillColor('#666').text(COPY_HINT, { align: 'left' });
    doc.fillColor('#000').moveDown(0.4);
    drawLine(doc, doc.y + 8); // 抄写横线

    // ─── 签字区 ───
    doc.moveDown(2.2);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    doc.font(font).fontSize(SIZE_WU);
    const signText = `承诺人签字：        车牌号：        日期：${year}年${month}月${day}日`;

    const signLabelWidth = doc.widthOfString('承诺人签字：');
    const signX = doc.page.margins.left + signLabelWidth;
    const signY = doc.y;

    if (signBuffer) {
      try {
        const imgH = 36;
        doc.image(signBuffer, signX, signY - 6, { width: 80, height: imgH, fit: [80, imgH] });
        doc.moveDown(1.6);
        doc.font(font).fontSize(SIZE_WU).text('车牌号：', { align: 'left', continued: true });
        // 车牌号与日期之间空开
        doc.text(`                       日期：${year}年${month}月${day}日`);
      } catch (e) {
        console.error('[pdf] 签名图插入失败:', e.message);
        doc.font(font).fontSize(SIZE_WU).text(signText, { align: 'left' });
      }
    } else {
      doc.font(font).fontSize(SIZE_WU).text(signText, { align: 'left' });
    }

    // ─── 库管/装卸队负责人部分（五号） ───
    doc.moveDown(1.5);
    doc.font(font).fontSize(SIZE_WU).text(SIGN_HEADER, { align: 'left' });
    doc.moveDown(0.5);
    doc.text(SIGN_CONFIRM, { align: 'left' });
    doc.moveDown(1.5);
    drawLine(doc, doc.y + 4);

    doc.moveDown(2.2);
    doc.font(font).fontSize(SIZE_WU).text(SIGN_DONE, { align: 'left' });
    doc.moveDown(1.5);
    drawLine(doc, doc.y + 4);

    doc.end();
  });
}

module.exports = {
  generatePromisePdf,
  downloadFile,
};
