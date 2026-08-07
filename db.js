const { Sequelize, DataTypes } = require("sequelize");

const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql",
});

const Counter = sequelize.define("Counter", {
  count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
});

const Transport = sequelize.define("Transport", {
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '运输类别：收货/发货',
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '司机姓名',
  },
  idcard: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '身份证号码',
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '联系手机号',
  },
  carType: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '车型',
  },
  startAddr: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '运输起始地',
  },
  destAddr: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '运输目的地',
  },
  factoryAddr: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '工厂地址',
  },
  arriveTime: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '车辆到达时间',
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '运输中',
    comment: '状态：运输中/运输完成',
  },
  signImg: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '签名图片云存储fileID',
  },
  imgList: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]',
    comment: '凭证图片JSON数组',
    get() {
      const raw = this.getDataValue('imgList');
      return raw ? JSON.parse(raw) : [];
    },
    set(val) {
      this.setDataValue('imgList', JSON.stringify(val || []));
    },
  },
  openid: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '微信用户openid',
  },
  privacyAgreed: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    comment: '是否已同意隐私保护指引',
  },
  signConfirmed: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    comment: '是否确认电子签名法律效力',
  },
  signConfirmedAt: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '电子签名确认时间',
  },
});

async function init() {
  await Counter.sync({ alter: true });
  await Transport.sync({ alter: true });
}

module.exports = {
  init,
  Counter,
  Transport,
};
