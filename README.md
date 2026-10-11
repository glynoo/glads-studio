# GLADS Studio · Golden20 案例复核

这是 GLADS v1.0 交付包的**本地可运行案例复核系统**。它读取交付包中的 20 个 Golden20 案例，展示原图、精确融合掩码和 58 张 Big-LaMa 参考候选，支持账号登录、素材上传、图像比较、定位批注、人工决策与导出。

## 运行

需要 Node.js 20.19+、Python 3.9+，以及同级目录 `GLADS_v1.0交付包/GLADS-03-Golden20-Reference-v1.0_20260810.zip`。

```sh
cd glads-studio
npm install
npm run dev
```

打开终端显示的本机地址（通常是 `http://127.0.0.1:5173/`），先注册账号，再登录使用。首次启动会核对 Golden20 压缩包的 SHA256；如果文件缺失或损坏，服务会明确报错。可用 `GLADS_GOLDEN20_ZIP` 指定其他存放位置，用 `GLADS_REVIEW_DB` 指定本地数据库路径，用 `GLADS_UPLOAD_DIR` 指定上传文件目录。

同机运行多份工作台时，可分别设置 `GLADS_WEB_PORT` 和 `GLADS_API_PORT`，网页会自动连接对应的本地服务。

## 当前功能

- 首页：左侧查看本人上传素材的待核对任务及 Golden20 待复核案例；右侧查看复核分布、候选覆盖、风险证据、上传素材处理进度和最近判断。
- 登录注册：邮箱和密码注册、登录与退出；账号身份自动关联人工记录。
- 素材池：沿用现有洞窟列表、层级树和详情布局，支持新建及编辑洞窟时代与备注；多文件拖拽上传、队列预览、失败重试；洞窟、壁面、分类、标签及文本组合筛选与排序；最近上传、本人收藏和项目文件夹归档；编辑来源、备注与标签；二次确认删除及关联切片清理。收藏、项目、标签和洞窟资料保存到数据库。仅创建人/上传人可编辑或删除相关资料，含其他人切片的图片不能删除。原图 SHA256 与 Golden20 一致时显示关联参考资产。
- 工作台：20 例切换与筛选；双图、宫格、卷帘；同步缩放和平移；精确执行掩码叠加；像素差异；全屏检查。
- 来源：按交付包清单显示案例、候选哈希、掩码外改动记录和风险。第 6、9 例缺少 R12，界面明确标为“未生成”。
- 人工记录：登录账号作为复核人，添加定位批注和判断理由；选择 `approve`、`reject`、`secondary_repair_required` 或 `defer_expert`。高风险案例不能直接采纳。所有已提交结论按时间追加，旧记录保留。
- 人工复核：按案例筛选，直接对照原图、掩码与候选，记录判断理由和查看历史；可进入同一案例的工作台细查。
- 设置：管理账号名称与密码、调整当前浏览器的比较模式和掩码透明度、查看候选资料和近期人工判断、下载记录包。
- 导出：ZIP 包含 `reviews.csv`、`annotations.csv`、`case_index.json` 和来源说明。图片仍由校验过的原始交付包保存。

账号、登录会话、素材索引与人工记录存于 `data/reviews.sqlite3`；上传图片存于 `data/uploads/`；未提交的表单暂存于当前浏览器。备份时请同时保存数据库和上传目录。服务默认只监听本机。

Windows 启动与测试默认使用 `python`，其他系统默认使用 `python3`。可用 `GLADS_PYTHON` 指定解释器路径。素材池洞窟和图片选择会同步到地址栏，支持刷新恢复、直接链接和浏览器前进后退；读取失败时可点击“重新读取”。

## 协作结构

团队协作以 `feature/remaining-pages` 为基线，每位成员使用自己的功能分支；不要直接修改或推送 `main`。首次克隆可运行：

```sh
git clone --branch feature/remaining-pages --single-branch https://github.com/glynoo/glads-studio.git
cd glads-studio
git switch -c feature/your-name
```

修改后运行构建和测试，再执行 `git push -u origin feature/your-name`，向 `feature/remaining-pages` 提交 PR，由团队审核后统一合并。已有个人功能分支时继续在该分支工作。推送需要仓库协作者写权限；没有写权限时可通过 fork 提交 PR。无需把 Golden20 ZIP、上传文件或本地数据库提交到仓库。

原版掩码、模型、运行证据目录通过可选配置 `GLADS_MATERIAL_POOL_DIR` 连接。该变量指向原版 `assets/glads/` 目录，里面须包含 `catalog.json`。例如 PowerShell 中先设置 `$env:GLADS_MATERIAL_POOL_DIR='D:/material-pool/assets/glads'`，再启动服务。目录中的图片和证据文件仅通过登录后的 API 读取，按 24 项分页搜索；模型只登记元数据时不会提供下载。未配置目录时页面显示明确错误与重试入口。大批原始文件及模型权重不提交到 Git。

此接入复用原版功能，保留仓库当前 UI。旧原型浏览器中的本地收藏和上传元数据不会自动转换成新账号数据；已有仓库数据库则通过增量迁移保留。

| 位置                        | 职责                                                       |
| --------------------------- | ---------------------------------------------------------- |
| `server/app.py`             | 读取并校验参考包、账号登录、保存上传素材与人工记录、导出 |
| `src/services/reviewApi.js` | 前端与本地服务的唯一请求入口                               |
| `src/features/workbench/`   | 工作台状态、图像检查和各独立面板                           |
| `src/pages/`                | 登录注册、首页、素材池、复核记录和设置                        |
| `src/pages/pages.css`      | 四个页面的样式，避免修改工作台基础样式                       |
| `src/services/preferences.js` | 当前浏览器的显示偏好                                     |
| `src/components/UI.jsx`     | 最小共享面板、弹窗与状态标记                               |
| `src/main.jsx`              | 一级页面导航                                               |
| `docs/architecture.md`      | 数据来源、扩展边界与算法接入条件                           |

新算法结果接入时，先在服务层新增结果来源及映射，再复用图像检查组件。不要让前端直接调用算法脚本、修改交付包或读取任意本机路径。

## 检查

```sh
npm run build
npm test
npm run test:api
```

浏览器核心流程的检查记录见 `docs/verification.md`。这些检查只证明本地复核流程可运行，不是算法质量评估或多人部署验收。
