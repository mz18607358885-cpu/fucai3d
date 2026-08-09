# 福彩3D 杀号系统专业版 v5.7

## 部署到 Netlify

### 方法 1:拖拽部署(最快)

1. 把整个目录压缩成 zip
2. 打开 https://app.netlify.com/drop
3. 拖入 zip 文件
4. 几秒钟后给你一个 `xxx.netlify.app` 子域名
5. 在 Netlify 控制台可以改子域名或绑定自己的域名

### 方法 2:Git 部署(推荐,自动更新)

```bash
# 1. 推送到 GitHub
git init
git add .
git commit -m "init"
git remote add origin https://github.com/你的用户名/fucai3d.git
git push -u origin main

# 2. 在 netlify.com 选 "Add new site" → "Import existing project" → 选 GitHub repo
# 3. Build command 留空,Publish directory 填 .
# 4. Deploy
```

### 方法 3:Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=.
```

## 默认密码

- **主链接**:`918918`(完整版,所有功能 + 我的投注 + 收藏夹)
- **副链接**:`112233`(只读版,不含分享入口)

## 核心功能

- **16 个杀号/选号公式** + 200 期真实回测数据
- **方案 C**:排除 30% + 选 70% 混合(基于十位轴 + 用户手动杀号)
- **手动杀号**:候选号点击 → 加入"我的杀号" → 算法硬排除
- **收藏夹**:智能选号一键收藏(localStorage 持久化)
- **复制号码**:整组/单注,空格分隔
- **实时数据抓取**:点"🔄 手动刷新数据" → 抓 cwl/500.com 官方最新期
- **我的投注**:自选 + 智能选号,自动跟历史开奖对比(3位/2位/1位中)

## 系统性能(199 期真实回测 · 995 注)

| 命中 | 比例 |
|---|---|
| 3位中 | 0.10% |
| 2位中 | 3.22% |
| 1位中 | 25.83% |
| 0位中 | 69.85% |

数学期望为负,娱乐为主,仅供参考。

## 文件结构

```
fucai3d/
├── index.html          # 主链接
├── sub.html            # 副链接(只读)
├── netlify.toml        # Netlify 配置
├── css/
│   └── style.css       # 主题样式
└── js/
    ├── data.js         # 200 期历史数据(2026-01-09 → 2026-08-06)
    ├── formulas.js     # 16 个公式 + BACKTEST
    ├── auth.js         # 密码认证
    ├── countdown.js    # 21:15 倒计时
    ├── dataFetcher.js  # 实时数据抓取(cwl/500.com + CORS proxy)
    ├── myBets.js       # 我的投注(自选 + 跟投)
    └── main.js         # 主逻辑
```

## 浏览器兼容

- Chrome / Edge / Safari / Firefox 现代版本
- 移动端响应式
- 隐身/无痕模式也可

## License

仅供学习娱乐,不得用于商业用途。
