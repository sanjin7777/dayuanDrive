const Koa = require("koa");
const Router = require("koa-router");
const logger = require("koa-logger");
const bodyParser = require("koa-bodyparser");
const { init: initDB, Counter, Transport } = require("./db");
const { syncTransport, syncStatusChange } = require("./sync");

const router = new Router();

const HOME_PAGE = `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"/><title>大源仓储运输登记系统</title></head>
<body><h2>大源仓储运输登记系统 - API 服务运行中</h2></body>
</html>
`;

router.get("/", async (ctx) => {
  ctx.body = HOME_PAGE;
});

// ==================== 运输登记 API ====================

// 创建运输记录
router.post("/api/transport", async (ctx) => {
  const openid = ctx.request.headers["x-wx-openid"] || "";
  const body = ctx.request.body;

  const record = await Transport.create({
    type: body.type,
    name: body.name,
    idcard: body.idcard,
    phone: body.phone,
    carType: body.carType,
    startAddr: body.startAddr,
    destAddr: body.destAddr,
    factoryAddr: body.factoryAddr,
    arriveTime: body.arriveTime,
    status: "运输中",
    signImg: body.signImg || "",
    imgList: body.imgList || [],
    openid,
  });

  // 同步到外部系统
  syncTransport(record.toJSON()).catch(err => {
    console.error('外部系统同步失败(创建):', err.message);
  });

  ctx.body = { code: 0, data: record };
});

// 获取运输记录列表
router.get("/api/transport", async (ctx) => {
  const openid = ctx.request.headers["x-wx-openid"] || "";
  const { status } = ctx.query;

  const where = {};
  if (openid) where.openid = openid;
  if (status) where.status = status;

  const list = await Transport.findAll({
    where,
    order: [["createdAt", "DESC"]],
  });

  ctx.body = { code: 0, data: list };
});

// 获取单条运输记录
router.get("/api/transport/:id", async (ctx) => {
  const { id } = ctx.params;
  const record = await Transport.findByPk(id);
  if (!record) {
    ctx.status = 404;
    ctx.body = { code: 1, msg: "记录不存在" };
    return;
  }
  ctx.body = { code: 0, data: record };
});

// 更新运输记录（上传图片、结束运输等）
router.put("/api/transport/:id", async (ctx) => {
  const { id } = ctx.params;
  const body = ctx.request.body;

  const record = await Transport.findByPk(id);
  if (!record) {
    ctx.status = 404;
    ctx.body = { code: 1, msg: "记录不存在" };
    return;
  }

  if (body.status) record.status = body.status;

  if (body.addImages && body.addImages.length > 0) {
    const current = record.imgList || [];
    record.imgList = [...current, ...body.addImages];
  }

  if (body.signImg) record.signImg = body.signImg;

  await record.save();

  // 同步到外部系统
  syncStatusChange(record.toJSON()).catch(err => {
    console.error('外部系统同步失败(更新):', err.message);
  });

  ctx.body = { code: 0, data: record };
});

// 获取微信 Open ID
router.get("/api/wx_openid", async (ctx) => {
  if (ctx.request.headers["x-wx-source"]) {
    ctx.body = ctx.request.headers["x-wx-openid"];
  }
});

// ==================== 原 Counter API (保留兼容) ====================

router.post("/api/count", async (ctx) => {
  const { request } = ctx;
  const { action } = request.body;
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({ truncate: true });
  }
  ctx.body = { code: 0, data: await Counter.count() };
});

router.get("/api/count", async (ctx) => {
  ctx.body = { code: 0, data: await Counter.count() };
});

const app = new Koa();
app
  .use(logger())
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods());

const port = process.env.PORT || 80;
async function bootstrap() {
  try {
    await initDB();
    app.listen(port, () => {
      console.log("启动成功，端口:", port);
    });
  } catch (err) {
    console.error("启动失败:", err.message);
    console.error("请检查 MySQL 环境变量是否已配置: MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS");
    process.exit(1);
  }
}
bootstrap();
