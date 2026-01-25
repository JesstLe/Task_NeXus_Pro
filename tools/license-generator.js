#!/usr/bin/env node
/**
 * Task Nexus 许可证生成工具
 * 
 * 使用方法：
 *   node license-generator.js <机器码>
 * 
 * 示例：
 *   node license-generator.js A1B2C3D4E5F6G7H8
 * 
 * 此工具仅供软件作者使用，请勿泄露！
 */

const crypto = require('crypto');

// 许可证密钥 - 必须与 main.js 中的 LICENSE_SECRET 保持一致！
const LICENSE_SECRET = 'TN_2024_K7x9Qm3Wp5Yz8Rv2';

function generateLicenseKey(machineId) {
    if (!machineId || machineId.length < 8) {
        throw new Error('无效的机器码');
    }

    const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
    hmac.update(machineId.toUpperCase());
    return hmac.digest('hex').substring(0, 16).toUpperCase();
}

// 命令行参数处理
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log(`
╔══════════════════════════════════════════════════╗
║      Task Nexus 许可证生成工具 v1.0              ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  使用方法:                                       ║
║    node license-generator.js <机器码>            ║
║                                                  ║
║  示例:                                           ║
║    node license-generator.js A1B2C3D4E5F6G7H8   ║
║                                                  ║
╚══════════════════════════════════════════════════╝
  `);
    process.exit(0);
}

const machineId = args[0].toUpperCase();

try {
    const licenseKey = generateLicenseKey(machineId);

    console.log(`
╔══════════════════════════════════════════════════╗
║           许可证生成成功！                       ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  机器码:   ${machineId.padEnd(35)}║
║  激活码:   ${licenseKey.padEnd(35)}║
║                                                  ║
╚══════════════════════════════════════════════════╝

请将激活码 [${licenseKey}] 发送给用户。
  `);
} catch (e) {
    console.error('错误:', e.message);
    process.exit(1);
}
