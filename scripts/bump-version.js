const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJsonPath = path.resolve(__dirname, '../package.json');
// 读取 package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// 解析版本号
let [major, minor, patch] = packageJson.version.split('.').map(Number);

// 增加 patch
patch++;

// 检查是否需要进位 (Patch >= 10 则进位到 Minor)
if (patch >= 10) {
  patch = 0;
  minor++;
}

// 组合新版本号
const newVersion = `${major}.${minor}.${patch}`;
console.log(`Version Bump: ${packageJson.version} -> ${newVersion}`);

// 更新 package.json 对象
packageJson.version = newVersion;

// 写回文件
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

// 尝试执行 git 命令 (模拟 npm version 的行为)
try {
    // 检查是否有 git
    execSync('git --version', { stdio: 'ignore' });
    
    // 添加 package.json
    execSync(`git add "${packageJsonPath}"`);
    
    // 提交
    execSync(`git commit -m "v${newVersion}"`);
    
    // 打标签
    execSync(`git tag "v${newVersion}"`);
    
    console.log(`Git commit and tag created: v${newVersion}`);
} catch (error) {
    console.warn('Warning: Git operation failed or Git not available. Skipping git commit/tag.');
    console.warn(error.message);
}
