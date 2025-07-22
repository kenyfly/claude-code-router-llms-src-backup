# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 核心开发指令

- **构建项目**: `npm run build`
- **启动服务**: `npm start`
- **启动开发服务**: `npm run dev`

## 沟通语言

- **请始终使用中文与用户沟通**。
- **所有的 Git 提交信息 (Commit Message) 也必须使用中文书写**。

## 核心架构

- **命令行接口 (CLI)**: 所有用户命令的入口和参数解析位于 `src/cli.ts`。
- **服务启动**: 服务启动的核心逻辑在 `src/index.ts` 中的 `run` 函数。
- **后台进程管理**: 所有与服务进程、PID 文件相关的工具函数都在 `src/utils/processCheck.ts` 中。
- **端口管理**:
    - 应用支持通过 `--port` 或 `-p` 命令行参数指定运行端口。
    - PID 文件会根据端口号动态生成，允许多个服务实例同时运行。
