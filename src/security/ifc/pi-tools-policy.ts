/**
 * PI-Tools 策略实现 - 个人信息保护工具策略
 * 
 * 功能：识别和保护个人敏感信息（PII）相关的工具调用
 * 包括：身份证号、手机号、银行卡、邮箱等敏感数据的访问控制
 * 
 */

//#region src/security/ifc/pi-tools-policy.ts

import { createLabel, flowsTo, joinLabels, hideValue } from './core';

// ==================== 常量定义 ====================

/**
 * PII 工具类型枚举
 */
export enum PIIToolType {
    /** 身份证号相关 */
    ID_NUMBER = 'id_number',
    /** 手机号相关 */
    PHONE_NUMBER = 'phone_number',
    /** 银行卡相关 */
    BANK_CARD = 'bank_card',
    /** 邮箱地址相关 */
    EMAIL = 'email',
    /** 地址相关 */
    ADDRESS = 'address',
    /** 姓名相关 */
    NAME = 'name',
    /** 通用 PII */
    GENERAL_PII = 'general_pii'
}

/**
 * PII 敏感级别
 */
export enum PIISensitivityLevel {
    /** 高敏感：身份证号、银行卡 */
    HIGH = 'high',
    /** 中敏感：手机号、邮箱 */
    MEDIUM = 'medium',
    /** 低敏感：姓名、地址 */
    LOW = 'low'
}

/**
 * PII 工具元数据
 */
export interface PIIToolMetadata {
    /** 工具名称 */
    name: string;
    /** PII 工具类型 */
    piiType: PIIToolType;
    /** 敏感级别 */
    sensitivity: PIISensitivityLevel;
    /** 是否需要额外授权 */
    requiresAuthorization: boolean;
    /** 允许的上下文标签 */
    allowedContextLabels: Array<{
        integrity: 'T' | 'U';
        confidentiality: Set<string>;
    }>;
}

/**
 * PII 数据模式（用于识别 PII 内容）
 */
export const PII_PATTERNS: Record<PIIToolType, RegExp> = {
    [PIIToolType.ID_NUMBER]: /(?<![0-9])[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![0-9])/g,
    [PIIToolType.PHONE_NUMBER]: /(?<![0-9])1[3-9]\d{9}(?![0-9])/g,
    [PIIToolType.BANK_CARD]: /(?<![0-9])[1-9]\d{15,18}(?![0-9])/g,
    [PIIToolType.EMAIL]: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    [PIIToolType.ADDRESS]: /(?:省|市|区|县|镇|乡|村|街道|路|号|栋|单元|室)[\u4e00-\u9fa50-9]{5,}/g,
    [PIIToolType.NAME]: /(?:姓名 | 名字 | 人名)[:：]\s*[\u4e00-\u9fa5]{2,4}/g,
    [PIIToolType.GENERAL_PII]: /(?:身份证 | 手机号 | 银行卡 | 邮箱|地址|姓名)[:：]\s*[^\s,，.。]{5,}/g
};

// ==================== PII 工具注册表 ====================

/**
 * 预定义的 PII 工具列表
 */
export const PREDEFINED_PII_TOOLS: PIIToolMetadata[] = [
    {
        name: 'get_user_id_number',
        piiType: PIIToolType.ID_NUMBER,
        sensitivity: PIISensitivityLevel.HIGH,
        requiresAuthorization: true,
        allowedContextLabels: [
            { integrity: 'T', confidentiality: new Set(['system', 'admin']) }
        ]
    },
    {
        name: 'get_user_phone',
        piiType: PIIToolType.PHONE_NUMBER,
        sensitivity: PIISensitivityLevel.MEDIUM,
        requiresAuthorization: true,
        allowedContextLabels: [
            { integrity: 'T', confidentiality: new Set(['system', 'user']) }
        ]
    },
    {
        name: 'get_user_bank_card',
        piiType: PIIToolType.BANK_CARD,
        sensitivity: PIISensitivityLevel.HIGH,
        requiresAuthorization: true,
        allowedContextLabels: [
            { integrity: 'T', confidentiality: new Set(['system', 'admin']) }
        ]
    },
    {
        name: 'get_user_email',
        piiType: PIIToolType.EMAIL,
        sensitivity: PIISensitivityLevel.MEDIUM,
        requiresAuthorization: false,
        allowedContextLabels: [
            { integrity: 'T', confidentiality: new Set(['system', 'user']) }
        ]
    },
    {
        name: 'get_user_address',
        piiType: PIIToolType.ADDRESS,
        sensitivity: PIISensitivityLevel.LOW,
        requiresAuthorization: false,
        allowedContextLabels: [
            { integrity: 'T', confidentiality: new Set(['system', 'user']) }
        ]
    },
    {
        name: 'get_user_name',
        piiType: PIIToolType.NAME,
        sensitivity: PIISensitivityLevel.LOW,
        requiresAuthorization: false,
        allowedContextLabels: [
            { integrity: 'T', confidentiality: new Set(['system', 'user']) }
        ]
    },
    {
        name: 'get_user_info',
        piiType: PIIToolType.GENERAL_PII,
        sensitivity: PIISensitivityLevel.HIGH,
        requiresAuthorization: true,
        allowedContextLabels: [
            { integrity: 'T', confidentiality: new Set(['system', 'admin']) }
        ]
    },
    {
        name: 'update_user_info',
        piiType: PIIToolType.GENERAL_PII,
        sensitivity: PIISensitivityLevel.HIGH,
        requiresAuthorization: true,
        allowedContextLabels: [
            { integrity: 'T', confidentiality: new Set(['system', 'admin']) }
        ]
    }
];

// ==================== PII 策略引擎 ====================

/**
 * PII 策略检查器
 */
export class PIIToolsPolicyEngine {
    /** PII 工具注册表 */
    private piiTools: Map<string, PIIToolMetadata> = new Map();
    
    /** PII 检测统计 */
    private stats = {
        totalChecks: 0,
        blocked: 0,
        allowed: 0,
        hidden: 0
    };

    constructor() {
        // 注册预定义的 PII 工具
        for (const tool of PREDEFINED_PII_TOOLS) {
            this.registerPIITool(tool);
        }
    }

    /**
     * 注册 PII 工具
     */
    registerPIITool(metadata: PIIToolMetadata) {
        this.piiTools.set(metadata.name, metadata);
    }

    /**
     * 检查工具是否是 PII 工具
     */
    isPIITool(toolName: string): boolean {
        return this.piiTools.has(toolName);
    }

    /**
     * 获取 PII 工具元数据
     */
    getPIIToolMetadata(toolName: string): PIIToolMetadata | undefined {
        return this.piiTools.get(toolName);
    }

    /**
     * 检测内容中是否包含 PII
     */
    detectPII(content: string): Array<{
        type: PIIToolType;
        matches: string[];
        count: number;
    }> {
        const results: Array<{
            type: PIIToolType;
            matches: string[];
            count: number;
        }> = [];

        for (const [typeStr, pattern] of Object.entries(PII_PATTERNS)) {
            const type = typeStr as PIIToolType;
            const matches = content.match(pattern);
            if (matches && matches.length > 0) {
                results.push({
                    type,
                    matches: [...new Set(matches)], // 去重
                    count: matches.length
                });
            }
        }

        return results;
    }

    /**
     * 检查 PII 工具调用是否允许
     */
    checkPIIToolCall(
        toolName: string,
        contextLabel: { integrity: 'T' | 'U'; confidentiality: Set<string> },
        memory?: Map<string, any>
    ): {
        allowed: boolean;
        reason?: string;
        policyType: 'PI-Tools';
        action?: 'allow' | 'block' | 'hide';
    } {
        this.stats.totalChecks++;

        // 检查是否是 PII 工具
        const metadata = this.piiTools.get(toolName);
        if (!metadata) {
            return {
                allowed: true,
                policyType: 'PI-Tools'
            };
        }

        // 检查上下文完整性
        if (contextLabel.integrity !== 'T') {
            this.stats.blocked++;
            return {
                allowed: false,
                reason: `PII tool "${toolName}" requires trusted context (integrity="T"), but got "${contextLabel.integrity}"`,
                policyType: 'PI-Tools',
                action: 'block'
            };
        }

        // 检查是否需要额外授权
        if (metadata.requiresAuthorization) {
            // 简化实现：检查上下文是否包含 'admin' 或 'system'
            const hasAdmin = contextLabel.confidentiality.has('admin') ||
                            contextLabel.confidentiality.has('system');
            if (!hasAdmin) {
                this.stats.blocked++;
                return {
                    allowed: false,
                    reason: `PII tool "${toolName}" requires admin authorization (sensitivity: ${metadata.sensitivity})`,
                    policyType: 'PI-Tools',
                    action: 'block'
                };
            }
        }

        // 检查允许的上下文标签
        let contextAllowed = false;
        for (const allowedLabel of metadata.allowedContextLabels) {
            if (flowsTo(contextLabel, allowedLabel)) {
                contextAllowed = true;
                break;
            }
        }

        if (!contextAllowed) {
            this.stats.blocked++;
            return {
                allowed: false,
                reason: `PII tool "${toolName}" context not in allowed labels`,
                policyType: 'PI-Tools',
                action: 'block'
            };
        }

        this.stats.allowed++;
        return {
            allowed: true,
            policyType: 'PI-Tools',
            action: 'allow'
        };
    }

    /**
     * 隐藏结果中的 PII 数据
     */
    hidePIIInResult(
        result: any,
        contextLabel: { integrity: 'T' | 'U'; confidentiality: Set<string> },
        memory: Map<string, any>
    ): {
        value: any;
        hiddenCount: number;
    } {
        let hiddenCount = 0;

        const hideInString = (content: string): string => {
            const piiDetected = this.detectPII(content);
            if (piiDetected.length === 0) return content;

            let modifiedContent = content;
            for (const pii of piiDetected) {
                for (const match of pii.matches) {
                    // 检查是否应该隐藏（根据敏感级别和上下文）
                    const shouldHide = this.shouldHidePII(pii.type, contextLabel);
                    if (shouldHide) {
                        const varName = `#hidden-pii-${Date.now()}-${hiddenCount}#`;
                        memory.set(varName, {
                            value: match,
                            type: pii.type,
                            label: {
                                integrity: 'T',
                                confidentiality: new Set(['system'])
                            }
                        });
                        modifiedContent = modifiedContent.replace(match, varName);
                        hiddenCount++;
                        this.stats.hidden++;
                    }
                }
            }
            return modifiedContent;
        };

        // 递归处理结果对象
        const processValue = (val: any): any => {
            if (typeof val === 'string') {
                return hideInString(val);
            } else if (val !== null && typeof val === 'object') {
                if (Array.isArray(val)) {
                    return val.map(processValue);
                }
                const result: any = {};
                for (const [key, value] of Object.entries(val)) {
                    result[key] = processValue(value);
                }
                return result;
            }
            return val;
        };

        return {
            value: processValue(result),
            hiddenCount
        };
    }

    /**
     * 判断是否应该隐藏 PII
     */
    private shouldHidePII(
        piiType: PIIToolType,
        contextLabel: { integrity: 'T' | 'U'; confidentiality: Set<string> }
    ): boolean {
        // 高敏感 PII：总是隐藏，除非上下文是 system
        if (piiType === PIIToolType.ID_NUMBER || 
            piiType === PIIToolType.BANK_CARD) {
            return !contextLabel.confidentiality.has('system');
        }

        // 中敏感 PII：隐藏，除非上下文包含 user 或 system
        if (piiType === PIIToolType.PHONE_NUMBER ||
            piiType === PIIToolType.EMAIL) {
            return !(contextLabel.confidentiality.has('user') ||
                    contextLabel.confidentiality.has('system'));
        }

        // 低敏感 PII：不隐藏
        return false;
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * 重置统计
     */
    resetStats() {
        this.stats = {
            totalChecks: 0,
            blocked: 0,
            allowed: 0,
            hidden: 0
        };
    }
}

// ==================== 与 IFC 中间件集成 ====================

/**
 * 创建 PI-Tools 策略中间件
 */
export function createPIIToolsMiddleware() {
    const engine = new PIIToolsPolicyEngine();

    return {
        /**
         * 检查工具调用
         */
        checkToolCall: (
            toolName: string,
            contextLabel: { integrity: 'T' | 'U'; confidentiality: Set<string> },
            memory?: Map<string, any>
        ) => {
            return engine.checkPIIToolCall(toolName, contextLabel, memory);
        },

        /**
         * 处理工具返回结果
         */
        processResult: (
            result: any,
            contextLabel: { integrity: 'T' | 'U'; confidentiality: Set<string> },
            memory: Map<string, any>
        ) => {
            return engine.hidePIIInResult(result, contextLabel, memory);
        },

        /**
         * 获取引擎实例
         */
        getEngine: () => engine
    };
}

// ==================== 导出 ====================

export {
    PIIToolsPolicyEngine,
    createPIIToolsMiddleware,
    PREDEFINED_PII_TOOLS,
    PII_PATTERNS,
    PIIToolType,
    PIISensitivityLevel
};

//#endregion
