const fs = require('fs');
const path = require('path');

// 配置文件路径
const tauriConfPath = path.resolve(__dirname, '../tauri-v2/src-tauri/tauri.conf.json');
const cargoTomlPath = path.resolve(__dirname, '../tauri-v2/src-tauri/Cargo.toml');
const packageJsonPath = path.resolve(__dirname, '../package.json');
const workflowPath = path.resolve(__dirname, '../.agent/workflows/build-release.md');

const buildRsPath = path.resolve(__dirname, '../tauri-v2/src-tauri/build.rs');

// 读取当前版本
function getCurrentVersion() {
    if (fs.existsSync(tauriConfPath)) {
        const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
        return conf.version;
    }
    return "3.0.0";
}

// 满10进1规则
function bumpVersion(version) {
    let [major, minor, patch] = version.split('.').map(Number);
    patch++;
    if (patch >= 10) {
        patch = 0;
        minor++;
    }
    if (minor >= 10) {
        minor = 0;
        major++;
    }
    return `${major}.${minor}.${patch}`;
}

const currentVersion = getCurrentVersion();
const newVersion = bumpVersion(currentVersion);

console.log(`Bumping version: ${currentVersion} -> ${newVersion}`);

// 1. 更新 tauri.conf.json
if (fs.existsSync(tauriConfPath)) {
    const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    conf.version = newVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(conf, null, 4));
    console.log(`Updated ${tauriConfPath}`);
}

// 2. 更新 Cargo.toml
if (fs.existsSync(cargoTomlPath)) {
    let content = fs.readFileSync(cargoTomlPath, 'utf8');
    const regex = /^version\s*=\s*"[^"]+"/m;
    if (regex.test(content)) {
        content = content.replace(regex, `version = "${newVersion}"`);
        fs.writeFileSync(cargoTomlPath, content);
        console.log(`Updated ${cargoTomlPath}`);
    } else {
        console.warn(`Warning: Could not find version field in ${cargoTomlPath}`);
    }
}

// 3. 更新根目录 package.json
if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Updated ${packageJsonPath}`);
}

// 4. 更新 Workflow 文档
if (fs.existsSync(workflowPath)) {
    let content = fs.readFileSync(workflowPath, 'utf8');
    const today = new Date().toISOString().split('T')[0];
    const versionRegex = /\*\*V\d+\.\d+\.\d+\*\* \(Released \d{4}-\d{2}-\d{2}\)/;
    if (versionRegex.test(content)) {
        content = content.replace(versionRegex, `**V${newVersion}** (Released ${today})`);
        fs.writeFileSync(workflowPath, content);
        console.log(`Updated ${workflowPath}`);
    }
}

// 5. 强制触发 build.rs 重新运行 (Touch build.rs)
if (fs.existsSync(buildRsPath)) {
    const time = new Date();
    try {
        fs.utimesSync(buildRsPath, time, time);
        console.log(`Touched ${buildRsPath} to force rebuild`);
    } catch (e) {
        console.error(`Failed to touch build.rs: ${e.message}`);
    }
} else {
    console.warn(`Warning: build.rs not found at ${buildRsPath}`);
}

console.log('Version bump complete.');
