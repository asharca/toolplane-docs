# 发布


ToolPlane 用 `release-please` 自动计算语义化版本，但发布准备由手动触发。实际流程以 [`release-please.yml`](../.github/workflows/release-please.yml) 为准。

## GitHub 配置

建议为准备发布的 bot 或维护者账户配置独立的 `RELEASE_PLEASE_TOKEN` 仓库 secret，并授予 release-please 所需的 contents 和 pull-request 权限。未配置时，工作流会回退到 `secrets.GITHUB_TOKEN`；独立 token 不是该工作流强制要求的前置条件。

`secrets.GITHUB_TOKEN` 用于登录 GHCR 和上传发布产物。独立的 release-please token 还能让 bot 创建的 PR 触发正常的 `pull_request` 事件。CI 对同仓库的 release-please 分支另外提供 `pull_request_target` 元数据校验，不能把该校验等同于完整应用测试。

仓库规则要求 review 时，release PR 也应按这些规则审查和合并。

## 日常 CI

[`ci.yml`](../.github/workflows/ci.yml) 监听 `pull_request`、指定的 `pull_request_target` 事件和 `workflow_dispatch`，不监听 `push`。

普通 PR 和未勾选 `full` 的手动运行只执行 `validate`：安装锁定依赖、生成 Prisma Client，再运行 `pnpm check`（Biome 和 Next 路由／TypeScript 类型检查）。不启动数据库、不应用迁移，不运行测试或应用构建。

完整验证需要手动运行 `ci` 并设置 `full=true`：三个独立 runner 各自使用一次性 pgvector PostgreSQL 和 Docker，分片内串行运行测试；另行执行应用构建、runtime 制品校验和 Linux、macOS、Windows Connector 检查。Linux 完整检查还包含 Docker、离线 LSP/debugpy 与浏览器沙箱路径。本地全量验证同样应使用独立的测试数据库，启用 pgvector、应用迁移并准备所需辅助镜像，再运行 `pnpm test`。不要把测试指向业务数据库；完整 CI 不替代已授权的 SSH 实机或真实模型验收。

同仓库中以 `release-please--branches--` 开头的分支另外通过 `pull_request_target` 提供名为 `validate` 的发布元数据检查。它只允许 `.release-please-manifest.json`、`CHANGELOG.md` 和 `package.json` 三个文件，不执行 PR 代码，也不提供 Connector 或完整应用测试结论。普通 `pull_request` 事件仍按上面的默认路径处理。

普通功能合并不会重复运行完整 CI，也不会发布镜像。推送到 `main` 会触发独立的发布工作流，但只有 release-please 创建了 release 才执行发布步骤。推送 `vX.Y.Z` tag 也是一条显式发布路径。

## 发布流程

1. 用 **Squash and merge** 把功能 PR 合并进 `main`，使每个 PR 对应一个可发布提交。
2. 手动运行 `release-please` 工作流，设置 `target_branch=main`，打开或更新 release PR。
3. 审查版本号、changelog 和 manifest 的变更，准备好发布时合并 release PR。
4. 合并产生的 `main` 推送会运行 release-please，但禁用 PR 创建；当它创建 release 后，才发布应用镜像、LSP 工具镜像、独立 debugpy 捕获镜像和 runtime tarball／SHA-256。Agent 默认沙箱镜像由独立的 `sandbox-image` 工作流发布；应用发布成功不能代替这些运行时依赖的可用性检查，部署步骤见[工具镜像部署](./RUNTIME_OPERATIONS.zh-CN.md#agent-工具镜像部署)。

标准流程无需手动改版本号或推 tag。工作流也支持显式推送 `vX.Y.Z` tag：先检查 tag 与 `package.json` 版本一致，再创建或更新 release 并发布产物。

## 如何发布

1. 打开 GitHub → Actions → `release-please`，点击 `Run workflow`。
2. 保持 `target_branch=main`。
3. 审查提议的版本号和 changelog，等待发布元数据检查通过，准备好后合并 release PR。

这次合并就是手动发布闸门。虽然 dispatch 接受其他 `target_branch`，自动分支推送发布只监听 `main`；在其他分支准备 release PR，不代表该分支已经配置了自动发布。
