#!/bin/bash

# 主控制脚本 - tool 修复调试工作流
# 可以运行全部阶段或单独运行某个阶段

echo "🎯 Claude Code Router - Tool 修复调试工作流"
echo "=================================================="

# 显示帮助信息
show_help() {
    echo "使用方法:"
    echo "  ./run_all.sh [阶段]"
    echo ""
    echo "阶段选项:"
    echo "  1, build         - 重构项目 (停止服务、构建)"
    echo "  2, start         - 启动服务 (启动并检查状态)"
    echo "  3, test          - 运行测试 (各种测试用例)"
    echo "  4, logs          - 查看日志 (分析调试信息)"
    echo "  all              - 运行全部阶段 (默认)"
    echo "  help, -h         - 显示帮助信息"
    echo ""
    echo "示例:"
    echo "  ./run_all.sh           # 运行全部阶段"
    echo "  ./run_all.sh build     # 只重构项目"
    echo "  ./run_all.sh test      # 只运行测试"
    echo "  ./run_all.sh logs      # 只查看日志"
}

# 运行单个阶段
run_stage() {
    local STAGE=$1
    local SCRIPT_NAME=$2
    local DESCRIPTION=$3
    
    echo -e "\n🚀 执行阶段 $STAGE: $DESCRIPTION"
    echo "=================================================="
    
    if [ ! -f "$SCRIPT_NAME" ]; then
        echo "❌ 脚本文件不存在: $SCRIPT_NAME"
        exit 1
    fi
    
    chmod +x "$SCRIPT_NAME"
    
    if ./"$SCRIPT_NAME"; then
        echo "✅ 阶段 $STAGE 完成"
        return 0
    else
        echo "❌ 阶段 $STAGE 失败"
        return 1
    fi
}

# 运行全部阶段
run_all_stages() {
    echo "🔄 开始运行全部阶段..."
    local FAILED_STAGES=()
    
    # 阶段1: 构建
    if run_stage "1" "1_build.sh" "重构项目"; then
        echo "✅ 阶段1完成"
    else
        FAILED_STAGES+=("1-构建")
        echo "❌ 阶段1失败，是否继续？(y/n)"
        read -t 10 -r CONTINUE_CHOICE
        if [ "$CONTINUE_CHOICE" != "y" ] && [ "$CONTINUE_CHOICE" != "Y" ]; then
            echo "🛑 用户选择停止"
            exit 1
        fi
    fi
    
    # 阶段2: 启动服务
    if run_stage "2" "2_start_service.sh" "启动服务"; then
        echo "✅ 阶段2完成"
    else
        FAILED_STAGES+=("2-启动服务")
        echo "❌ 阶段2失败，无法继续后续测试"
        exit 1
    fi
    
    # 阶段3: 运行测试
    if run_stage "3" "3_test.sh" "运行测试"; then
        echo "✅ 阶段3完成"
    else
        FAILED_STAGES+=("3-测试")
        echo "⚠️ 阶段3失败，但继续查看日志以分析问题"
    fi
    
    # 阶段4: 查看日志
    if run_stage "4" "4_logs.sh" "查看日志"; then
        echo "✅ 阶段4完成"
    else
        FAILED_STAGES+=("4-日志")
        echo "⚠️ 阶段4失败，但不影响主流程"
    fi
    
    # 总结
    echo -e "\n=== 执行总结 ==="
    if [ ${#FAILED_STAGES[@]} -eq 0 ]; then
        echo "🎉 所有阶段成功完成！"
        echo "💡 如果测试显示问题依然存在，请检查日志以进一步分析"
    else
        echo "⚠️ 以下阶段存在问题："
        for stage in "${FAILED_STAGES[@]}"; do
            echo "  - $stage"
        done
        echo "🔍 建议单独运行失败的阶段进行调试"
    fi
}

# 确保脚本有执行权限
chmod +x 1_build.sh 2>/dev/null || true
chmod +x 2_start_service.sh 2>/dev/null || true
chmod +x 3_test.sh 2>/dev/null || true
chmod +x 4_logs.sh 2>/dev/null || true

# 解析命令行参数
case "${1:-all}" in
    1|build)
        run_stage "1" "1_build.sh" "重构项目"
        ;;
    2|start)
        run_stage "2" "2_start_service.sh" "启动服务"
        ;;
    3|test)
        run_stage "3" "3_test.sh" "运行测试"
        ;;
    4|logs)
        run_stage "4" "4_logs.sh" "查看日志"
        ;;
    all)
        run_all_stages
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        echo "❌ 未知参数: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

echo -e "\n🎯 工作流完成！" 