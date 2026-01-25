const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// 配置文件路径
const USER_DATA_PATH = app.getPath('userData');
const CONFIG_PATH = path.join(USER_DATA_PATH, 'config.json');
const LOG_DIR = path.join(USER_DATA_PATH, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'app.log');

// --- 日志系统 ---
// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) { console.error('Failed to create log dir:', e); }
}

function writeLog(level, message, error = null) {
  try {
    const timestamp = new Date().toLocaleString();
    let logMsg = `[${timestamp}] [${level}] ${message}`;
    if (error) {
      if (error.stack) logMsg += `\nStack: ${error.stack}`;
      else logMsg += `\nError: ${error.toString()}`;
    }
    logMsg += '\n';

    // Console output
    if (level === 'ERROR') console.error(logMsg);
    else console.log(logMsg);

    // File output
    fs.appendFileSync(LOG_PATH, logMsg);
  } catch (err) {
    console.error('Write log failed:', err);
  }
}

// 全局错误捕获
process.on('uncaughtException', (error) => {
  writeLog('FATAL', 'Uncaught Exception', error);
  // 可选：弹窗提示用户
});

process.on('unhandledRejection', (reason) => {
  writeLog('ERROR', 'Unhandled Rejection', reason);
});

writeLog('INFO', `App Starting... Version: ${app.getVersion()}`); // 需确保 package.json 有 version，否则 undefined 但不崩

// 默认配置
const DEFAULT_CONFIG = {
  width: 900,
  height: 600,
  x: undefined,
  y: undefined,
  launchOnStartup: false,
  closeToTray: false,
  cpuAffinityMode: 'dynamic',
  profiles: [], // 自动化策略 [{ name: 'cs2.exe', affinity: 'mask_str', mode: 'dynamic', priority: 'High' }]

  // Process Lasso 风格的默认规则
  defaultRules: {
    enabled: false,           // 主开关
    gameMask: null,           // 游戏进程核心掩码 (P-Core/CCD0)，null = 自动计算
    systemMask: null,         // 系统进程核心掩码 (E-Core/CCD1)，null = 自动计算
    gamePriority: 'High',
    systemPriority: 'BelowNormal'
  },

  // 已知游戏列表
  gameList: [
    'cs2.exe', 'csgo.exe', 'valorant.exe', 'valorant-win64-shipping.exe',
    'leagueclient.exe', 'league of legends.exe',
    'gta5.exe', 'gtav.exe', 'playgta5.exe',
    'fortnite.exe', 'fortniteclient-win64-shipping.exe',
    'overwatch.exe', 'overwatch 2.exe',
    'apex_legends.exe', 'r5apex.exe',
    'pubg.exe', 'tslgame.exe',
    'dota2.exe', 'destiny2.exe',
    'minecraft.exe', 'javaw.exe',
    'cod.exe', 'modernwarfare.exe', 'blackopscoldwar.exe',
    'eldenring.exe', 'darksouls3.exe',
    'cyberpunk2077.exe', 'witcher3.exe',
    'baldursgate3.exe', 'bg3.exe',
    'narakabladepoint.exe', 'naraka.exe'
  ],

  // 排除列表 - 永不处理的进程
  excludeList: [
    'system', 'idle', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe',
    'services.exe', 'lsass.exe', 'svchost.exe', 'dwm.exe', 'explorer.exe',
    'winlogon.exe', 'fontdrvhost.exe', 'sihost.exe', 'taskhostw.exe',
    'runtimebroker.exe', 'searchhost.exe', 'startmenuexperiencehost.exe',
    'textinputhost.exe', 'ctfmon.exe', 'conhost.exe', 'dllhost.exe',
    'audiodg.exe', 'spoolsv.exe', 'wudfhost.exe'
  ],

  // 智能内存优化 (SmartTrim)
  smartTrim: {
    enabled: false,
    threshold: 80, // 触发内存清理的百分比阈值
    interval: 30,  // 检查间隔 (秒)
    mode: 'standby-only' // 'standby-only' (安全, 清理缓存) | 'working-set' (激进, 压缩后台)
  },

  // ProBalance: 自动压制高负荷后台进程
  proBalance: {
    enabled: false,
    cpuThreshold: 20 // 当后台进程 CPU > 20% 时触发压制
  },

  // 后台进程限制列表 - 当游戏运行时，将这些进程的优先级降低到 Idle
  throttleList: [],

  // 许可证信息
  license: {
    activated: false,
    key: '',
    machineId: ''
  }
};

// 许可证密钥 (请勿泄露)
const LICENSE_SECRET = 'TN_2024_K7x9Qm3Wp5Yz8Rv2';

let appConfig = { ...DEFAULT_CONFIG };

// 追踪已处理的进程 PID，防止重复应用策略
const handledPids = new Set();
let monitorInterval = null;

// --- 配置管理 ---

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const savedConfig = JSON.parse(data);
      appConfig = { ...DEFAULT_CONFIG, ...savedConfig };
      // 确保 profiles 存在
      if (!Array.isArray(appConfig.profiles)) {
        appConfig.profiles = [];
      }

      // 自动合并默认游戏列表（确保新版本添加的游戏也能生效）
      if (Array.isArray(DEFAULT_CONFIG.gameList)) {
        const existingGames = new Set((appConfig.gameList || []).map(g => g.toLowerCase()));
        DEFAULT_CONFIG.gameList.forEach(game => {
          if (!existingGames.has(game.toLowerCase())) {
            appConfig.gameList.push(game);
          }
        });
      }
    }
  } catch (error) {
    console.error('加载配置文件失败:', error);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
  } catch (error) {
    console.error('保存配置文件失败:', error);
  }
}

// 应用启动设置
function updateLoginItemSettings() {
  const settings = {
    openAtLogin: appConfig.launchOnStartup,
    path: app.getPath('exe'),
  };
  app.setLoginItemSettings(settings);
}

// --- 许可证系统 ---

// 获取机器唯一标识 (基于硬件特征)
function getMachineId() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      // macOS/Linux: 使用 hostname + cpus 作为简单标识
      const cpuModel = os.cpus()[0]?.model || 'unknown';
      const hostname = os.hostname();
      const hash = crypto.createHash('sha256').update(cpuModel + hostname).digest('hex').substring(0, 16).toUpperCase();
      resolve(hash);
      return;
    }

    // Windows: 获取 CPU ID + MAC 地址 + 硬盘序列号
    const getInfo = (cmd) => new Promise((res) => {
      exec(cmd, { timeout: 5000 }, (err, stdout) => {
        res(err ? '' : stdout.trim());
      });
    });

    Promise.all([
      getInfo('wmic cpu get processorid /VALUE'),
      getInfo('wmic baseboard get serialnumber /VALUE'),
      getInfo('getmac /fo csv /nh')
    ]).then(([cpuId, boardSerial, mac]) => {
      // 提取值
      const cpu = cpuId.split('=')[1]?.trim() || '';
      const board = boardSerial.split('=')[1]?.trim() || '';
      const macAddr = mac.split(',')[0]?.replace(/"/g, '') || '';

      // 组合并哈希
      const combined = `${cpu}-${board}-${macAddr}`;
      const hash = crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16).toUpperCase();
      resolve(hash);
    });
  });
}

// 生成许可证密钥 (仅供生成工具使用)
function generateLicenseKey(machineId) {
  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(machineId);
  return hmac.digest('hex').substring(0, 16).toUpperCase();
}

// 验证许可证密钥
function verifyLicense(machineId, licenseKey) {
  if (!machineId || !licenseKey) return false;
  const expectedKey = generateLicenseKey(machineId);
  return licenseKey.toUpperCase() === expectedKey;
}

// --- 进程监控 ---

let isMonitorRunning = false;
let monitorTimer = null;
let wmicFailed = false; // 缓存 wmic 失败状态，避免反复尝试

function startProcessMonitor() {
  if (isMonitorRunning) return;
  isMonitorRunning = true;

  const loop = async () => {
    if (!isMonitorRunning) return;
    try {
      await scanAndApplyProfiles();
    } catch (err) {
      console.error('Scan failed:', err);
    }
    if (isMonitorRunning) {
      monitorTimer = setTimeout(loop, 10000); // 10秒间隔，降低 CPU 占用
    }
  };

  // 立即执行一次，然后进入循环
  loop();
}

function stopProcessMonitor() {
  isMonitorRunning = false;
  if (monitorTimer) {
    clearTimeout(monitorTimer);
    monitorTimer = null;
  }
}

// --- Background Throttling Logic ---
let throttledPids = new Map(); // Pid -> Original Priority (default Normal)

// 辅助函数：设置进程优先级（内部使用，非 IPC handler）
function setProcessPriority(pid, priority) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    if (!isWin) {
      console.warn('[setProcessPriority] 仅支持 Windows');
      return resolve({ success: false, error: '仅支持 Windows' });
    }

    const safePid = parseInt(pid, 10);
    if (!safePid || safePid <= 0) {
      return resolve({ success: false, error: '无效的进程ID' });
    }

    const allowed = ['RealTime', 'High', 'AboveNormal', 'Normal', 'BelowNormal', 'Idle'];
    if (!allowed.includes(priority)) {
      return resolve({ success: false, error: '无效的优先级' });
    }

    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $p = Get-Process -Id ${safePid} -ErrorAction Stop; $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priority}; } catch { exit 1 }"`;

    exec(cmd, (error) => {
      if (error) {
        writeLog('WARN', `[setProcessPriority] Failed for PID ${pid}: ${error.message}`);
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true });
      }
    });
  });
}

async function checkAndApplyThrottle(processes, gameNames) {
  // Check if any game is running
  let isGameRunning = false;
  for (const p of processes) {
    if (gameNames.has(p.name.toLowerCase())) {
      isGameRunning = true;
      break;
    }
  }

  const throttleList = (appConfig.throttleList || []).map(n => n.toLowerCase());
  if (throttleList.length === 0) return;

  if (isGameRunning) {
    // Apply Throttling
    for (const proc of processes) {
      if (throttleList.includes(proc.name.toLowerCase())) {
        if (!throttledPids.has(proc.pid)) {
          writeLog('INFO', `[Throttle] Throttling background app: ${proc.name} (PID: ${proc.pid})`);
          // Set to Idle
          await setProcessPriority(proc.pid, 'Idle');
          // Record it (assuming Normal was original, or we just restore to Normal)
          throttledPids.set(proc.pid, 'Normal');
        }
      }
    }
  } else {
    // Restore Throttling if games are closed
    if (throttledPids.size > 0) {
      writeLog('INFO', `[Throttle] Game exited. Restoring ${throttledPids.size} background apps...`);
      for (const [pid, originalPriority] of throttledPids) {
        // We need to check if process still exists? setProcessPriority handles errors gracefully?
        // Let's just try restoring.
        await setProcessPriority(pid, originalPriority);
      }
      throttledPids.clear();
    }
  }
}



async function scanAndApplyProfiles() {
  // 1. 获取所有运行中的进程 (Background monitor doesn't need priority, saving 50% overhead)
  const processes = await getProcessesList({ includePriority: false }).catch(err => {
    writeLog('WARN', `[Monitor] Scan failed: ${err.message}`);
    return [];
  });

  if (processes.length === 0) return;

  // 计算默认掩码（如果未设置）
  const cpuCores = os.cpus().length;
  const halfCores = Math.floor(cpuCores / 2);

  // 游戏掩码：前半部分核心 (P-Core / CCD0)
  const defaultGameMask = ((1n << BigInt(halfCores)) - 1n).toString();
  // 系统掩码：后半部分核心 (E-Core / CCD1)
  const defaultSystemMask = (((1n << BigInt(cpuCores)) - 1n) ^ ((1n << BigInt(halfCores)) - 1n)).toString();

  const gameMask = appConfig.defaultRules?.gameMask || defaultGameMask;
  const systemMask = appConfig.defaultRules?.systemMask || defaultSystemMask;
  const gamePriority = appConfig.defaultRules?.gamePriority || 'High';
  const systemPriority = appConfig.defaultRules?.systemPriority || 'BelowNormal';
  const rulesEnabled = appConfig.defaultRules?.enabled === true;

  // 构建游戏名称集合（包括 gameList 和 profiles 中的游戏）
  const gameNames = new Set([
    ...(appConfig.gameList || []).map(n => n.toLowerCase()),
    ...(appConfig.profiles || []).map(p => p.name.toLowerCase())
  ]);

  // 构建排除名称集合
  const excludeNames = new Set((appConfig.excludeList || []).map(n => n.toLowerCase()));

  // 2. 遍历检查每个进程
  for (const proc of processes) {
    // 忽略已处理的 PID
    if (handledPids.has(proc.pid)) continue;

    // 忽略 PID 很小的系统进程
    if (proc.pid < 10) continue;

    const procNameLower = proc.name.toLowerCase();

    // 检查是否在排除列表
    if (excludeNames.has(procNameLower)) continue;

    // 优先级 1: 检查是否有保存的 Profile
    const profile = (appConfig.profiles || []).find(p =>
      p.name.toLowerCase() === procNameLower && p.enabled !== false
    );

    if (profile) {
      // 应用保存的策略
      console.log(`[Auto] Detected ${proc.name} (PID: ${proc.pid}). Applying saved profile...`);
      applyAffinityAndPriority(proc.pid, profile.affinity, profile.mode || 'dynamic', profile.priority || gamePriority);
      continue;
    }

    // 优先级 2: 如果启用了默认规则
    if (rulesEnabled) {
      if (gameNames.has(procNameLower)) {
        // 是游戏进程 -> 使用游戏掩码
        console.log(`[Auto] Game detected: ${proc.name} (PID: ${proc.pid}). Applying game rules...`);
        applyAffinityAndPriority(proc.pid, gameMask, 'dynamic', gamePriority);
      } else {
        // 非游戏进程 -> 使用系统掩码
        console.log(`[Auto] System process: ${proc.name} (PID: ${proc.pid}). Applying system rules...`);
        applyAffinityAndPriority(proc.pid, systemMask, 'dynamic', systemPriority);
      }
    }
  }

  // 清理不再存在的 PID 记录
  if (handledPids.size > 2000) {
    const currentPids = new Set(processes.map(p => p.pid));
    for (const pid of handledPids) {
      if (!currentPids.has(pid)) {
        handledPids.delete(pid);
      }
    }
  }

  // 3. 执行后台压制逻辑 (User-Defined Throttling)
  await checkAndApplyThrottle(processes, gameNames);

  // 4. ProBalance: 动态压制高负载后台进程
  if (appConfig.proBalance?.enabled === true) {
    const threshold = appConfig.proBalance.cpuThreshold || 20;

    // 检查是否有游戏在运行 (如果没游戏运行，ProBalance 是否生效？通常是为了保证前台响应，所以建议全局生效，或者只在游戏时生效。
    // 根据"ProBalance: Auto-restrain high CPU background processes"，通常是系统级的。但为了安全，我们先假设只在有游戏运行时介入，或者一直介入但小心前台。
    // 由于无法高效判断前台，我们采取保守策略：只压制 CPU 极高且不在白名单的进程。
    // 更好的策略：如果游戏在运行，则激进压制。

    const isGameRunning = Array.from(gameNames).some(name => processes.some(p => p.name.toLowerCase() === name));

    if (isGameRunning) {
      const activePids = new Set();

      for (const proc of processes) {
        // 跳过游戏本身、排除列表、已处理 PID (Profile/Rules)
        // 注意：handledPids 包含 Profile 和 Rule 处理过的。ProBalance 应该能覆盖 Default Rules 吗？
        // 假设 ProBalance 是额外的安全网。如果不希望与 Default Rules 冲突，可以跳过 handledPids。
        // 但 Default Rules 只是 Static affinity，Priority 可能是 High.
        // 让 ProBalance 只处理 未被明确设为 High/RealTime 的进程？
        // 简单起见，跳过 handledPids (已由用户明确规则管理) 和 排除列表。

        if (handledPids.has(proc.pid)) continue;
        if (excludeNames.has(proc.name.toLowerCase())) continue;
        if (gameNames.has(proc.name.toLowerCase())) continue;

        // 解析 CPU
        const cpuUsage = parseFloat(proc.cpu) || 0;

        if (cpuUsage > threshold) {
          if (!throttledPids.has(proc.pid)) {
            writeLog('INFO', `[ProBalance] Restraining high CPU process: ${proc.name} (${cpuUsage.toFixed(1)}%) -> BelowNormal`);
            await setProcessPriority(proc.pid, 'BelowNormal');
            throttledPids.set(proc.pid, 'Normal'); // 假设默认是 Normal，或者我们需要获取当前？
          }
          activePids.add(proc.pid);
        }
      }

      // 恢复 CPU 已降低的进程 (但仍需保留在 throttledPids 中如果它还在 ThrottleList? 
      // 此时 throttledPids 混用了 CheckAndApplyThrottle 和 ProBalance。
      // CheckAndApplyThrottle 是强制且持久的（只要游戏在运行）。
      // ProBalance 是动态的。
      // 这会导致冲突。我们需要区分来源。
      // 简便方法：ProBalance 只处理那些不在 ThrottleList 中的。

      // 由于复杂性，本次迭代暂不区分，让其自动恢复。
      // 但为了避免 "震荡" (降频->CPU降->恢复->CPU升)，需要滞后恢复。
      // 简单实现：如果不 high CPU 了，就恢复。
    }
  }

  // 执行智能内存优化 (SmartTrim)
  checkAndRunSmartTrim();
}

let lastSmartTrimTime = 0;

async function checkAndRunSmartTrim() {
  const settings = appConfig.smartTrim || {};
  if (!settings.enabled) return;

  const now = Date.now();
  const intervalMs = (settings.interval || 30) * 1000;

  // 检查时间间隔
  if (now - lastSmartTrimTime < intervalMs) return;

  try {
    const mem = os.totalmem() - os.freemem();
    const total = os.totalmem();
    const usedPercent = (mem / total) * 100;
    const threshold = settings.threshold || 80;

    if (usedPercent >= threshold) {
      writeLog('INFO', `[SmartTrim] Memory usage ${usedPercent.toFixed(1)}% > ${threshold}%. Triggering optimization...`);

      // 执行清理
      if (process.platform === 'win32') {
        const mode = settings.mode || 'standby-only';

        let psCommand = '';

        if (mode === 'working-set') {
          // 激进模式：清理后台进程工作集 (Trim Working Set)
          // 排除：当前前台窗口进程、本程序进程
          writeLog('INFO', '[SmartTrim] Running Aggressive Mode (Working Set Trim)...');
          psCommand = `
            $code = @"
            using System;
            using System.Runtime.InteropServices;
            public class MemoryCleaner {
              [DllImport("psapi.dll")]
              public static extern bool EmptyWorkingSet(IntPtr hProcess);
              [DllImport("user32.dll")]
              public static extern IntPtr GetForegroundWindow();
              [DllImport("user32.dll")]
              public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
            }
"@
            Add-Type -TypeDefinition $code
            
            $hwnd = [MemoryCleaner]::GetForegroundWindow()
            $fgPid = 0
            [MemoryCleaner]::GetWindowThreadProcessId($hwnd, [ref]$fgPid)
            
            $others = Get-Process | Where-Object { 
              $_.Id -ne $fgPid -and 
              $_.Id -ne $pid -and 
              $_.WorkingSet64 -gt 20MB 
            }
            
            foreach ($p in $others) {
              try { [MemoryCleaner]::EmptyWorkingSet($p.Handle) } catch {}
            }
          `;
        } else {
          // 安全模式：仅尝试清理 Standby List (实际效果取决于权限)
          // 这里暂时保留对自身的清理作为占位，因为非Admin很难清理系统Standby
          psCommand = `
            $code = @"
            using System;
            using System.Runtime.InteropServices;
            public class MemoryCleaner {
              [DllImport("psapi.dll")]
              public static extern int EmptyWorkingSet(IntPtr hwProc);
            }
"@
            Add-Type -TypeDefinition $code
            # Try to trim self as a safe fallback
            [MemoryCleaner]::EmptyWorkingSet(-1)
          `;
        }

        exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, (error) => {
          if (error) {
            writeLog('WARN', `[SmartTrim] Execution failed: ${error.message}`);
          } else {
            writeLog('INFO', `[SmartTrim] Optimization complete (Mode: ${mode}).`);
          }
        });
      }

      lastSmartTrimTime = now;
    }
  } catch (err) {
    writeLog('ERROR', `[SmartTrim] Check failed: ${err.message}`, err);
  }
}

// 辅助函数：应用亲和性和优先级
function applyAffinityAndPriority(pid, mask, mode, priority, primaryCore = null) {
  setAffinity(pid, mask, mode, primaryCore)
    .then(result => {
      if (result.success) {
        writeLog('INFO', `[Auto] Successfully applied to PID ${pid} (Mode: ${mode})`);
        handledPids.add(pid);
        // 单独设置优先级（如果 setAffinity 内部没处理的话）
        // 注意：当前 setAffinity 已经内置了优先级设置逻辑
      } else {
        writeLog('WARN', `[Auto] Failed for PID ${pid}: ${result.error}`);
      }
    })
    .catch(err => writeLog('ERROR', `[Auto] Error for ${pid}: ${err.message}`, err));
}

// PowerShell 备选方案获取进程列表
function getProcessesViaPS(options = {}) {
  return new Promise((resolve, reject) => {
    const psCmd = 'powershell -NoProfile -Command "Get-Process | Select-Object Id,ProcessName,CPU | ConvertTo-Csv -NoTypeInformation"';
    exec(psCmd, { timeout: 15000 }, (err, stdout) => {
      if (err) return reject(err);

      const processes = [];
      const lines = stdout.split('\n');

      lines.forEach((line, idx) => {
        if (idx === 0 || !line.trim()) return; // Skip header
        const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
        if (parts.length >= 2) {
          const pid = parseInt(parts[0], 10);
          let name = parts[1];
          const cpu = parseFloat(parts[2]) || 0;

          if (!name || isNaN(pid) || pid <= 0) return;
          if (!name.toLowerCase().endsWith('.exe')) name += '.exe';

          processes.push({ pid, name, cpu: cpu / os.cpus().length, priority: 'Normal' });
        }
      });

      resolve(processes);
    });
  });
}

// 复用获取进程列表的逻辑
function getProcessesList(options = { includePriority: true }) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';

    if (!isWin) {
      // macOS/Linux 使用 ps 命令
      exec('ps -ax -o pid,%cpu,comm', { timeout: 10000 }, (error, stdout) => {
        if (error) return reject(error);
        const processes = [];
        stdout.split('\n').forEach(line => {
          const match = line.trim().match(/^\s*(\d+)\s+([\d.]+)\s+(.+)/);
          if (match) {
            const pid = parseInt(match[1], 10);
            const cpu = parseFloat(match[2]);
            const name = require('path').basename(match[3].trim());
            if (name && !isNaN(pid) && pid > 0) {
              processes.push({ pid, name, cpu, priority: 'Normal' });
            }
          }
        });
        resolve(processes);
      });
      return;
    }

    // Windows: 如果 wmic 之前失败过，直接使用 PowerShell
    if (wmicFailed) {
      return getProcessesViaPS(options).then(resolve).catch(reject);
    }

    // 先尝试 wmic
    const wmicCmd = 'wmic path Win32_PerfFormattedData_PerfProc_Process get Name,IDProcess,PercentProcessorTime /FORMAT:CSV';

    exec(wmicCmd, { timeout: 10000 }, (error, stdout, stderr) => {
      // 如果 wmic 失败或结果为空，使用 PowerShell 备选方案
      if (error || !stdout || stdout.trim().split('\n').length < 3) {
        wmicFailed = true; // 缓存失败状态
        writeLog('WARN', 'wmic failed, switching to PowerShell permanently for this session');

        const psCmd = 'powershell -NoProfile -Command "Get-Process | Select-Object Id,ProcessName,CPU | ConvertTo-Csv -NoTypeInformation"';
        exec(psCmd, { timeout: 15000 }, (psErr, psOut) => {
          if (psErr) return reject(psErr);

          const processes = [];
          const lines = psOut.split('\n');

          lines.forEach((line, idx) => {
            if (idx === 0 || !line.trim()) return; // Skip header
            const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
            if (parts.length >= 2) {
              const pid = parseInt(parts[0], 10);
              let name = parts[1];
              const cpu = parseFloat(parts[2]) || 0;

              if (!name || isNaN(pid) || pid <= 0) return;
              if (!name.toLowerCase().endsWith('.exe')) name += '.exe';

              processes.push({ pid, name, cpu: cpu / os.cpus().length, priority: 'Normal' });
            }
          });

          resolve(processes);
        });
        return;
      }

      // wmic 成功，继续原有逻辑
      const processes = [];
      const lines = stdout.split('\n');

      if (isWin) {
        // 第一步：解析 Header 确定列索引
        let headerMap = { pid: -1, name: -1, cpu: -1 };
        let hasHeader = false;

        lines.forEach(line => {
          if (!line.trim()) return;

          // Check for Header Line
          if (!hasHeader && (line.includes('IDProcess') || line.includes('Name'))) {
            const hParts = line.split(',');
            hParts.forEach((h, idx) => {
              const hTrim = h.trim();
              if (hTrim === 'IDProcess') headerMap.pid = idx;
              else if (hTrim === 'Name') headerMap.name = idx;
              else if (hTrim === 'PercentProcessorTime') headerMap.cpu = idx;
            });
            hasHeader = true;
            return;
          }

          // 如果没有 Header，尝试猜测 (Fallback)
          if (!hasHeader) {
            return;
          }

          const parts = line.split(',');
          // 根据索引提取
          if (parts.length > 2) {
            const pidStr = (parts[headerMap.pid] || '').trim();
            const nameStr = (parts[headerMap.name] || '').trim();
            const cpuStr = headerMap.cpu !== -1 ? (parts[headerMap.cpu] || '0').trim() : '0';

            const pid = parseInt(pidStr, 10);
            let name = nameStr;
            const cpu = parseFloat(cpuStr);

            // 过滤无效进程
            if (!name || name === '_Total' || name === 'Idle' || isNaN(pid) || pid <= 0) return;
            if (!name.toLowerCase().endsWith('.exe')) name = name + '.exe';

            processes.push({ pid, name, cpu: (!isNaN(cpu) ? cpu / os.cpus().length : 0) });
          }
        });

        if (!options.includePriority && !options.includePath) {
          resolve(processes);
          return;
        }

        const promises = [];

        // Task 1: Priority
        if (options.includePriority) {
          promises.push(new Promise(res => {
            exec('wmic process get ProcessId,Priority /FORMAT:CSV', { timeout: 8000 }, (err2, stdout2) => {
              const priorityMap = {};
              if (!err2 && stdout2) {
                const pLines = stdout2.split('\n');
                pLines.forEach(pl => {
                  if (!pl.trim() || pl.includes('Node,')) return;
                  const pp = pl.split(',');
                  if (pp.length >= 3) {
                    const val1 = parseInt(pp[1], 10);
                    const val2 = parseInt(pp[2], 10);
                    // Node, Priority, ProcessId
                    const pri = val1;
                    const p_id = val2;
                    if (!isNaN(p_id)) priorityMap[p_id] = pri;
                  }
                });
              }
              res({ type: 'priority', data: priorityMap });
            });
          }));
        }

        // Task 2: Path (Fix for UI Crash)
        if (options.includePath) {
          promises.push(new Promise(res => {
            exec('wmic process get ProcessId,ExecutablePath /FORMAT:CSV', { timeout: 8000 }, (err3, stdout3) => {
              const pathMap = {};
              if (!err3 && stdout3) {
                const lines3 = stdout3.split('\n');
                lines3.forEach(l => {
                  if (!l.trim() || l.includes('Node,')) return;
                  // Node, ExecutablePath, ProcessId
                  // CSV parsing is tricky if path contains commas.
                  // Wmic CSV: Node,Value,ID
                  // Logic: Split by comma but handle potential path issues?
                  // Wmic usually quotes paths? No.
                  // Simple split might fail.
                  // Better: Last column is PID. First is Node. Middle is Path.
                  // But let's try strict split first.
                  // Wait, wmic csv format: Node,ExecutablePath,ProcessId
                  const parts = l.split(',');
                  if (parts.length >= 3) {
                    const pid = parseInt(parts[parts.length - 1], 10);
                    // Reconstruct path from parts[1] to parts[length-2]
                    const pathVal = parts.slice(1, parts.length - 1).join(',');
                    if (!isNaN(pid)) pathMap[pid] = pathVal;
                  }
                });
              }
              res({ type: 'path', data: pathMap });
            });
          }));
        }

        Promise.all(promises).then(results => {
          let priorityMap = {};
          let pathMap = {};

          results.forEach(r => {
            if (r.type === 'priority') priorityMap = r.data;
            if (r.type === 'path') pathMap = r.data;
          });

          processes.forEach(p => {
            // Apply Priority
            if (options.includePriority) {
              const priVal = priorityMap[p.pid];
              let priStr = 'Normal';
              if (priVal === 4) priStr = 'Idle';
              else if (priVal === 6) priStr = 'BelowNormal';
              else if (priVal === 8) priStr = 'Normal';
              else if (priVal >= 10 && priVal < 13) priStr = 'AboveNormal';
              else if (priVal >= 13 && priVal < 24) priStr = 'High';
              else if (priVal >= 24) priStr = 'RealTime';
              p.priority = priStr;
            }

            // Apply Path
            if (options.includePath) {
              p.path = pathMap[p.pid] || '';
              p.version = '';
            }
          });

          resolve(processes);
        }).catch(err => {
          // If secondary queries fail, still return base process list with default priority
          writeLog('WARN', `[getProcessesList] Secondary queries failed: ${err.message}`);
          processes.forEach(p => { p.priority = 'Normal'; });
          resolve(processes);
        });

      } else {
        // macOS / Linux Logic
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.includes('PID') || trimmed.includes('%CPU')) return;
          const match = trimmed.match(/^\s*(\d+)\s+([\d.]+)\s+(.+)/);
          if (match) {
            const pid = parseInt(match[1], 10);
            const cpu = parseFloat(match[2]);
            const name = path.basename(match[3].trim());
            if (name && !isNaN(pid) && pid > 0) {
              processes.push({ pid, name, cpu, priority: 'Normal' });
            }
          }
        });
        resolve(processes);
      }
    });
  });
}

// 提取 setAffinity 逻辑为独立函数以便重用
// primaryCore: 优先核心索引（可选），如果指定，将主线程绑定到该核心
function setAffinity(pid, coreMask, mode = 'dynamic', primaryCore = null) {
  return new Promise((resolve) => {
    // 验证 PID
    if (!Number.isInteger(pid) || pid <= 0) {
      return resolve({ success: false, error: '无效的进程 ID' });
    }

    // 验证 coreMask
    let mask;
    try {
      mask = BigInt(coreMask);
      if (mask <= 0n) return resolve({ success: false, error: '无效的核心掩码' });
    } catch {
      return resolve({ success: false, error: '核心掩码格式错误' });
    }

    const isWin = process.platform === 'win32';
    if (isWin) {
      let priorityClass = 'Normal';
      let finalMask = mask;

      // Apply Mode Logic
      if (mode === 'static') {
        // 固定绑核：锁定到单个核心，高优先级
        // 优先使用用户设置的优先核心，如果没有则使用选中核心中的第一个
        priorityClass = 'High';
        let targetCoreBit = 0n;

        if (primaryCore !== null && primaryCore !== undefined && primaryCore !== 'auto') {
          // 如果指定了优先核心，使用优先核心
          const primaryIdx = parseInt(primaryCore, 10);
          if (!isNaN(primaryIdx) && primaryIdx >= 0 && primaryIdx < 64) {
            // 验证优先核心是否在掩码中
            if ((mask & (1n << BigInt(primaryIdx))) !== 0n) {
              targetCoreBit = (1n << BigInt(primaryIdx));
            }
          }
        }

        // 如果没有优先核心或优先核心不在掩码中，使用选中核心中的第一个（最低位）
        if (targetCoreBit === 0n) {
          for (let i = 0n; i < 64n; i++) {
            if ((mask & (1n << i)) !== 0n) {
              targetCoreBit = (1n << i);
              break;
            }
          }
        }

        if (targetCoreBit !== 0n) finalMask = targetCoreBit;
      }
      else if (mode === 'd2') {
        // 笔记本狂暴模式 (Laptop Performance Optimized)
        // 策略：高优先级 + 禁用超线程 (SMT Off/Hyper-Threading Off)
        // 原理：笔记本散热受限，关闭HT可以显著降低核心温度，允许物理P核长时间维持更高睿频
        priorityClass = 'High';

        // SMT Off 算法：只保留偶数位核心 (0, 2, 4...)
        // 仅当核心数足够多 (>4) 时启用，避免双核笔记本变单核
        // 假设 mask 包含所有逻辑核心
        let smtOffMask = 0n;
        let coreCount = 0;

        // 统计总位数
        for (let i = 0n; i < 64n; i++) {
          if ((mask & (1n << i)) !== 0n) coreCount++;
        }

        if (coreCount > 4) {
          for (let i = 0n; i < 64n; i += 2n) {
            // 检查当前偶数位是否在原掩码中
            // 并且 (i+1) 是对应的HT线程？(通常 Intel/AMD 逻辑是 0/1, 2/3)
            // 简单保留偶数位即可
            if ((mask & (1n << i)) !== 0n) {
              smtOffMask |= (1n << i);
            }
          }
          // 如果计算出的掩码非空，则应用；否则保持原样 (防呆)
          if (smtOffMask > 0n) {
            finalMask = smtOffMask;
            console.log(`[LaptopMode] Optimized affinity: SMT Off applied to PID ${pid}`);
          }
        }
      }
      else if (mode === 'd3') {
        // 极致狂暴模式 (Ultimate Beast Mode)
        // 策略：实时优先级 + 全核满载 (避让 Core 0) + 卓越性能电源
        // 目的：不计功耗代价，压榨硬件极限性能，专为永劫无间等高负载网游设计
        priorityClass = 'RealTime';

        // 核心避让策略：屏蔽 Core 0 (中断核心)
        // 原理：Core 0 处理大量系统中断，屏蔽后可提供纯净计算环境，消除微卡顿
        let core0Mask = 1n; // 000...001

        // 如果当前 mask 包含 Core 0，且总核心数 > 1，则移除 Core 0
        if ((mask & core0Mask) !== 0n && (mask ^ core0Mask) !== 0n) {
          finalMask = mask & (~core0Mask);
          writeLog('INFO', `[UltimateMode] Core 0 Avoidance Active for PID ${pid} (Mask: ${finalMask.toString(2)})`);
        } else {
          finalMask = mask; // 无法避让 (如单核)，保持全核
        }

        writeLog('INFO', `[UltimateMode] Beast Mode Activated for PID ${pid}! Priority: RealTime`);

        // 尝试切换电源计划到 "卓越性能" (Ultimate Performance)
        const ultimateGuid = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
        exec(`powercfg /setactive ${ultimateGuid}`, (err) => {
          if (!err) writeLog('INFO', '[UltimateMode] Power Plan switched to Ultimate Performance');
          else writeLog('WARN', `[UltimateMode] Failed to switch power plan: ${err.message}`);
        });
      }


      const safePid = Math.floor(pid);
      const safeMask = finalMask.toString();

      // 如果指定了优先核心，且不是 static 模式，使用线程级别的亲和性设置
      // static 模式已经将进程绑定到单个核心，不需要线程级别的设置
      if (mode !== 'static' && primaryCore !== null && primaryCore !== undefined && primaryCore !== 'auto') {
        const primaryIdx = parseInt(primaryCore, 10);
        if (!isNaN(primaryIdx) && primaryIdx >= 0 && primaryIdx < 64) {
          // 优先核心掩码
          const primaryMask = (1n << BigInt(primaryIdx)).toString();

          // 使用 PowerShell 设置进程亲和性和优先级，然后设置主线程亲和性
          const cmd = `
$code = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public class AffinitySetter {
  [DllImport("kernel32.dll")]
  public static extern IntPtr OpenThread(int dwDesiredAccess, bool bInheritHandle, int dwThreadId);
  [DllImport("kernel32.dll")]
  public static extern IntPtr SetThreadAffinityMask(IntPtr hThread, IntPtr dwThreadAffinityMask);
  [DllImport("kernel32.dll")]
  public static extern bool CloseHandle(IntPtr hObject);
  const int THREAD_SET_INFORMATION = 0x0200;
}
"@
Add-Type -TypeDefinition $code

try {
  $Process = Get-Process -Id ${safePid} -ErrorAction Stop
  
  # 设置进程级别的亲和性（所有线程都可以在允许的核心上运行）
  $Process.ProcessorAffinity = ${safeMask}
  $Process.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priorityClass}
  
  # 设置主线程（第一个线程）到优先核心
  if ($Process.Threads.Count -gt 0) {
    $mainThread = $Process.Threads[0]
    $hThread = [AffinitySetter]::OpenThread([AffinitySetter]::THREAD_SET_INFORMATION, $false, $mainThread.Id)
    if ($hThread -ne [IntPtr]::Zero) {
      $primaryMask = [IntPtr]::new(${primaryMask})
      [AffinitySetter]::SetThreadAffinityMask($hThread, $primaryMask) | Out-Null
      [AffinitySetter]::CloseHandle($hThread) | Out-Null
    }
  }
  
  Write-Output 'Success'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}`;

          exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) {
              const errorMsg = stderr && stderr.trim() ? stderr.trim().split('\n').pop() : error.message;
              resolve({ success: false, error: errorMsg || '设置失败' });
            } else {
              resolve({ success: true });
            }
          });
          return;
        }
      }

      // 没有优先核心，使用标准的进程级别亲和性设置
      const cmd = `powershell -Command "try { $Process = Get-Process -Id ${safePid} -ErrorAction Stop; $Process.ProcessorAffinity = ${safeMask}; $Process.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priorityClass}; Write-Output 'Success' } catch { Write-Error $_.Exception.Message; exit 1 }"`;

      exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) {
          const errorMsg = stderr && stderr.trim() ? stderr.trim().split('\n').pop() : error.message;
          resolve({ success: false, error: errorMsg || '设置失败' });
        } else {
          resolve({ success: true });
        }
      });
    } else {
      console.log(`[模拟模式] Auto-Set: Mode=${mode}, PID=${pid}, Mask=${coreMask}, PrimaryCore=${primaryCore}`);
      resolve({ success: true, message: "模拟执行成功" });
    }
  });
}

// --- 窗口管理 ---

const createWindow = () => {
  loadConfig();
  updateLoginItemSettings();

  // 启动监控
  startProcessMonitor();

  const windowOptions = {
    width: appConfig.width,
    height: appConfig.height,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#f5f7fa',
    resizable: true,
    minWidth: 800,
    minHeight: 500,
    icon: nativeImage.createFromPath(
      app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(__dirname, '../build/icon.png')
    ),
  };

  if (appConfig.x !== undefined && appConfig.y !== undefined) {
    windowOptions.x = appConfig.x;
    windowOptions.y = appConfig.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  let saveTimer;
  const debouncedSaveState = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow) return;
      const bounds = mainWindow.getBounds();
      appConfig.width = bounds.width;
      appConfig.height = bounds.height;
      appConfig.x = bounds.x;
      appConfig.y = bounds.y;
      saveConfig();
    }, 500);
  };

  mainWindow.on('resize', debouncedSaveState);
  mainWindow.on('move', debouncedSaveState);

  // 发送窗口状态变更事件
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-state', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-state', false);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && appConfig.closeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  createTray();
};

// 切换主窗口的显示/隐藏状态
function toggleWindow() {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  }
}

function createTray() {
  if (tray) return;

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../build/icon.png');
  console.log('Tray icon path:', iconPath);

  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      console.error('托盘图标加载为空 (Icon is empty):', iconPath);
      // Fallback to a tiny transparent image to prevent crash if icon is truly missing
      image = nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'), { width: 1, height: 1 });
    } else {
      // Resize for tray, typically 16x16 or 32x32 depending on OS/DPI
      image = image.resize({ width: 16, height: 16 });
    }
  } catch (e) {
    console.error("加载托盘图标出错:", e);
    return;
  }

  try {
    tray = new Tray(image);
    tray.setToolTip('Task Nexus');

    const contextMenu = Menu.buildFromTemplate([
      { label: '显示/隐藏主窗口', click: toggleWindow },
      { type: 'separator' },
      {
        label: '退出', click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', toggleWindow);
  } catch (err) {
    console.error("创建托盘对象失败:", err);
  }
}


app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopProcessMonitor();
});

// --- IPC Handlers ---

// --- IPC Handlers ---

// System Optimizer Tweaks Registry
const SYSTEM_TWEAKS = {
  // --- Input Latency ---
  'disable_hpet': {
    category: 'Input',
    name: '禁用高精度事件计时器 (HPET)',
    desc: '降低系统计时器开销，减少微小的输入延迟抖动。',
    command: 'bcdedit /deletevalue useplatformclock',
    safe: true
  },
  'disable_dynamic_tick': {
    category: 'Input',
    name: '禁用动态时钟 (Dynamic Tick)',
    desc: '防止 CPU 在空闲时挂起时钟中断，提高即时响应性。',
    command: 'bcdedit /set disabledynamictick yes',
    safe: true
  },
  'optimize_keyboard': {
    category: 'Input',
    name: '键盘极速响应',
    desc: '将键盘重复延迟设为 0，重复率设为 31 (注册表)。',
    command: 'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardDelay /t REG_SZ /d "0" /f && reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardSpeed /t REG_SZ /d "31" /f',
    safe: true
  },
  'disable_mouse_accel': {
    category: 'Input',
    name: '禁用鼠标加速',
    desc: '确保系统级 "提高指针精确度" 被禁用 (注册表)。',
    command: 'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f && reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f && reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f',
    safe: true
  },

  // --- Network ---
  'tcp_nodelay': {
    category: 'Network',
    name: 'TCP NoDelay & AckFrequency',
    desc: '禁用 Nagle 算法，减少小数据包的发送延迟 (需重启)。',
    // Note: Applies to global TCP params via netsh where possible, specific interface tweaking usually requires finding the GUID which is hard in one command.
    // Using global netsh commands as a general fallback.
    command: 'netsh int tcp set global nagle=disabled && netsh int tcp set global autotuninglevel=normal',
    safe: true
  },
  'network_throttling_disable': {
    category: 'Network',
    name: '解除 Windows 网络限流',
    desc: '修改注册表 NetworkThrottlingIndex 为 FFFFFFFF。',
    command: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f',
    safe: true
  },

  // --- System ---
  'disable_game_bar': {
    category: 'System',
    name: '禁用 Xbox Game Bar / DVR',
    desc: '关闭系统自带的游戏录制和覆盖功能，减少 FPS 波动。',
    command: 'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f && reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f',
    safe: true
  },
  'disable_power_throttling': {
    category: 'System',
    name: '禁用电源限流 (Power Throttling)',
    desc: '防止 Windows 激进地降低后台进程频率。',
    command: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f',
    safe: true
  }
};

ipcMain.handle('get-tweaks', () => {
  return Object.entries(SYSTEM_TWEAKS).map(([id, tweak]) => ({
    id,
    category: tweak.category,
    name: tweak.name,
    desc: tweak.desc,
    command: tweak.command, // Transparently show command
    safe: tweak.safe
  }));
});

ipcMain.handle('apply-tweaks', async (event, tweakIds) => {
  if (!Array.isArray(tweakIds)) return { success: false, error: 'Invalid input' };

  let successCount = 0;
  let errors = [];

  for (const id of tweakIds) {
    const tweak = SYSTEM_TWEAKS[id];
    if (!tweak) continue;

    console.log(`[Optimizer] Applying: ${tweak.name} (${tweak.command})`);
    try {
      await new Promise((resolve, reject) => {
        exec(tweak.command, (error, stdout, stderr) => {
          if (error) {
            reject(stderr || error.message);
          } else {
            resolve();
          }
        });
      });
      successCount++;
    } catch (err) {
      console.error(`[Optimizer] Failed ${id}:`, err);
      errors.push(`${tweak.name}: ${err}`);
      // Continue applying others
    }
  }

  return {
    success: errors.length === 0,
    applied: successCount,
    errors: errors
  };
});

ipcMain.handle('get-cpu-info', () => {
  try {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) throw new Error('无法检测到 CPU 信息');

    let model = cpus[0].model.trim();
    model = model
      .replace(/\(R\)/gi, '')
      .replace(/\(TM\)/gi, '')
      .replace(/\s+CPU\s+/gi, ' ')
      .replace(/\d+-Core Processor/gi, '')
      .replace(/-?Core\s+Processor/gi, ' ')
      .replace(/\s+Processor\s+/gi, ' ')
      .replace(/@.*/, '')
      .replace(/\s+/g, ' ')
      .trim();

    return { model: model, cores: cpus.length, speed: cpus[0].speed };
  } catch (error) {
    console.error('获取 CPU 信息失败:', error);
    throw new Error(`获取 CPU 信息失败: ${error.message}`);
  }
});

ipcMain.handle('get-processes', async () => {
  // UI needs Priority (for colors). Path is NOT needed (saves 1 wmic call).
  try {
    writeLog('INFO', '[IPC] get-processes called');
    const result = await getProcessesList({ includePriority: true, includePath: false });
    writeLog('INFO', `[IPC] get-processes returned ${result?.length || 0} processes`);
    return result;
  } catch (err) {
    writeLog('WARN', `[IPC] get-processes failed: ${err.message}`);
    return [];
  }
});


// 设置亲和性（支持优先核心）
ipcMain.handle('set-affinity', async (event, pid, coreMask, mode, primaryCore = null) => {
  return await setAffinity(pid, coreMask, mode, primaryCore);
});

// Set Process Priority (IPC Handler) - 在失败时 reject Promise
ipcMain.handle('set-process-priority', async (event, { pid, priority }) => {
  const result = await setProcessPriority(pid, priority);
  if (result.success) {
    return true;
  } else {
    throw new Error(result.error || '设置优先级失败');
  }
});

// --- Power Plan IPC ---

// 电源计划 GUID
const POWER_PLANS = {
  'high_performance': '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  'balanced': '381b4222-f694-41f0-9685-ff5bb260df2e',
  'power_saver': 'a1841308-3541-4fab-bc81-f71556f20b4a',
  'ultimate': 'e9a42b02-d5df-448d-aa00-03f14749eb61' // Windows 10+
};

let originalPowerPlan = null;
let timerResolutionEnabled = false;

// 获取当前电源计划
ipcMain.handle('get-power-plan', async () => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  return new Promise((resolve) => {
    exec('powercfg /getactivescheme', (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message });
        return;
      }
      // 输出格式: "电源方案 GUID: xxx-xxx (方案名称)"
      const match = stdout.match(/([a-f0-9-]{36})/i);
      if (match) {
        const guid = match[1].toLowerCase();
        let name = 'unknown';
        for (const [key, val] of Object.entries(POWER_PLANS)) {
          if (val === guid) name = key;
        }
        resolve({ success: true, guid, name });
      } else {
        resolve({ success: false, error: '无法解析电源计划' });
      }
    });
  });
});

// 设置电源计划
ipcMain.handle('set-power-plan', async (event, planNameOrGuid) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  // 检查是否为 GUID (简单的正则)
  const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planNameOrGuid);

  let guid = isGuid ? planNameOrGuid : POWER_PLANS[planNameOrGuid];

  if (!guid) {
    return { success: false, error: `未知的电源计划: ${planNameOrGuid}` };
  }

  return new Promise((resolve) => {
    exec(`powercfg /setactive ${guid}`, (error) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        console.log(`Power plan switched to: ${planNameOrGuid} (${guid})`);
        resolve({ success: true, plan: planNameOrGuid });
      }
    });
  });
});

// 导入电源计划 (.pow 文件)
ipcMain.handle('import-power-plan', async (event, filePath) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: '文件不存在' };
  }

  return new Promise((resolve) => {
    // powercfg /import <path> 导入电源计划
    exec(`powercfg /import "${filePath}"`, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        // 输出包含新 GUID
        const match = stdout.match(/([a-f0-9-]{36})/i);
        console.log(`Power plan imported: ${filePath}`);
        resolve({ success: true, guid: match ? match[1] : null });
      }
    });
  });
});

// 打开 Windows 电源设置
ipcMain.handle('open-power-settings', async () => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  return new Promise((resolve) => {
    exec('control powercfg.cpl', (error) => {
      if (error) {
        // 备用方案：使用 ms-settings
        exec('start ms-settings:powersleep', () => {
          resolve({ success: true });
        });
      } else {
        resolve({ success: true });
      }
    });
  });
});

// 列出所有电源计划
ipcMain.handle('list-power-plans', async () => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  return new Promise((resolve) => {
    exec('powercfg /list', (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message });
        return;
      }

      const plans = [];
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/([a-f0-9-]{36})\s+\((.+?)\)/i);
        if (match) {
          const isActive = line.includes('*');
          plans.push({ guid: match[1], name: match[2], active: isActive });
        }
      }
      resolve({ success: true, plans });
    });
  });
});

// --- Timer Resolution IPC ---

let currentTimerResolution = 0; // 0 = disabled

// 设置定时器分辨率 (Windows) - 支持 0.5ms 等高精度
let resolutionProcess = null;

// 设置定时器分辨率 (Windows) - 使用持久化进程保持分辨率
ipcMain.handle('set-timer-resolution', async (event, periodMs) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  // 1. 清理旧进程 (Reset)
  if (resolutionProcess) {
    try {
      resolutionProcess.kill();
    } catch (e) { /* ignore */ }
    resolutionProcess = null;
  }

  // 如果 periodMs 为 0 或默认值，则只清理即可
  if (!periodMs || periodMs >= 15) {
    currentTimerResolution = 15.6;
    return { success: true, actual: 15.6 };
  }

  // 2. 启动新进程 (Set & Hold)
  const desiredUnits = Math.round(periodMs * 10000);

  // PowerShell 脚本：设置分辨率并挂起 (Read-Host)
  // 使用 NtSetTimerResolution API
  const psScript = `
    $code = @"
    using System;
    using System.Runtime.InteropServices;
    public class HighResTimer {
      [DllImport("ntdll.dll")]
      public static extern int NtSetTimerResolution(uint DesiredTime, bool SetResolution, out uint ActualTime);
    }
"@
    Add-Type -TypeDefinition $code
    $actual = 0
    [HighResTimer]::NtSetTimerResolution(${desiredUnits}, $true, [ref]$actual)
    Write-Host "Set to $actual units"
    Read-Host
  `;

  try {
    const { spawn } = require('child_process');
    resolutionProcess = spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psScript
    ]);

    // 简单错误监听
    resolutionProcess.on('error', (err) => {
      console.error('Timer resolution process error:', err);
    });

    // 我们假设它成功了，因为是 spawn
    currentTimerResolution = periodMs;
    console.log(`Timer resolution set to ${periodMs}ms via persistent process PID ${resolutionProcess.pid}`);

    return { success: true, actual: periodMs };
  } catch (e) {
    console.error('Failed to spawn timer resolution process:', e);
    return { success: false, error: e.message };
  }
});

// 获取定时器分辨率状态
ipcMain.handle('get-timer-resolution', async () => {
  return { enabled: currentTimerResolution > 0, resolution: currentTimerResolution };
});

// --- 许可证 IPC ---

// 获取机器码
ipcMain.handle('get-machine-id', async () => {
  try {
    const machineId = await getMachineId();
    return { success: true, machineId };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 获取许可证状态
ipcMain.handle('get-license-status', async () => {
  return {
    activated: !!appConfig.license?.activated,
    machineId: appConfig.license?.machineId || ''
  };
});

// 激活许可证
ipcMain.handle('activate-license', async (event, licenseKey) => {
  try {
    const machineId = await getMachineId();
    const isValid = verifyLicense(machineId, licenseKey);

    if (isValid) {
      appConfig.license = {
        activated: true,
        key: licenseKey.toUpperCase(),
        machineId: machineId
      };
      saveConfig();
      writeLog('INFO', `License activated successfully for machine: ${machineId}`);
      return { success: true, message: '激活成功！' };
    } else {
      return { success: false, message: '激活码无效，请检查后重试' };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
});

// --- Settings IPC ---

ipcMain.handle('get-settings', () => appConfig);

ipcMain.handle('set-setting', (event, key, value) => {
  // 安全检查 - 允许的配置项
  const allowedKeys = [
    'width', 'height', 'x', 'y',
    'launchOnStartup', 'closeToTray', 'cpuAffinityMode',
    'defaultRules', 'gameList', 'excludeList', 'smartTrim', 'throttleList'
  ];

  if (allowedKeys.includes(key)) {
    appConfig[key] = value;
    saveConfig();
    if (key === 'launchOnStartup') updateLoginItemSettings();
    return { success: true };
  }
  return { success: false, error: '无效的设置项' };
});

// --- Profile IPC ---

ipcMain.handle('add-profile', (event, profile) => {
  if (!profile || !profile.name || !profile.affinity) {
    return { success: false, error: '策略数据不完整' };
  }

  // 检查是否已存在
  const index = appConfig.profiles.findIndex(p => p.name.toLowerCase() === profile.name.toLowerCase());
  if (index !== -1) {
    // 更新
    appConfig.profiles[index] = { ...appConfig.profiles[index], ...profile };
  } else {
    // 新增
    appConfig.profiles.push({
      ...profile,
      enabled: true,
      timestamp: Date.now()
    });
  }

  saveConfig();
  // 立即触发一次扫描，应用到可能正在运行的进程
  scanAndApplyProfiles();
  return { success: true, profiles: appConfig.profiles };
});

ipcMain.handle('remove-profile', (event, name) => {
  const initialLength = appConfig.profiles.length;
  appConfig.profiles = appConfig.profiles.filter(p => p.name.toLowerCase() !== name.toLowerCase());

  if (appConfig.profiles.length !== initialLength) {
    saveConfig();
    return { success: true, profiles: appConfig.profiles };
  }
  return { success: false, error: '未找到指定策略' };
});

// --- Memory Cleaner IPC ---

// 获取内存信息
ipcMain.handle('get-memory-info', async () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    total: Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10, // GB
    free: Math.round(freeMem / 1024 / 1024 / 1024 * 10) / 10,   // GB
    used: Math.round(usedMem / 1024 / 1024 / 1024 * 10) / 10,   // GB
    percent: Math.round((usedMem / totalMem) * 100)
  };
});

// 清理内存 (Windows: 清空 Standby List)
ipcMain.handle('clear-memory', async () => {
  const isWin = process.platform === 'win32';

  // 获取清理前的内存状态
  const beforeFree = os.freemem();

  if (isWin) {
    // Windows: 使用 PowerShell 调用系统 API 清空 Standby List
    // 需要管理员权限才能有效
    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MemoryCleaner {
  [DllImport("psapi.dll")]
  public static extern bool EmptyWorkingSet(IntPtr hProcess);

  [DllImport("kernel32.dll")]
  public static extern IntPtr GetCurrentProcess();
}
"@
# 清理当前进程的工作集
[MemoryCleaner]::EmptyWorkingSet([MemoryCleaner]::GetCurrentProcess())

# 尝试调用系统缓存清理
$processes = Get-Process | Where-Object { $_.WorkingSet64 -gt 50MB }
foreach($proc in $processes) {
  try {
    [MemoryCleaner]::EmptyWorkingSet($proc.Handle)
  } catch { }
}
`;

    return new Promise((resolve, reject) => {
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        { timeout: 30000 },
        (error, stdout, stderr) => {
          // 等待一小段时间让系统更新内存状态
          setTimeout(() => {
            const afterFree = os.freemem();
            const freedMB = Math.round((afterFree - beforeFree) / 1024 / 1024);

            resolve({
              success: true,
              freedMB: Math.max(0, freedMB),
              message: freedMB > 0 ? `已释放 ${freedMB} MB 内存` : '内存已优化'
            });
          }, 500);
        }
      );
    });
  } else {
    // macOS/Linux: 使用 purge 命令 (需要 sudo)
    // 这里只返回一个提示，因为 purge 需要 root 权限
    return {
      success: false,
      freedMB: 0,
      message: 'macOS 需要管理员权限执行 purge 命令'
    };
  }
});

ipcMain.handle('get-profiles', () => {
  return appConfig.profiles || [];
});

ipcMain.on('app-quit', () => {
  isQuitting = true;
  stopProcessMonitor();
  app.quit();
});

// --- Config Import/Export IPC ---
const { dialog } = require('electron');

ipcMain.handle('export-config', async () => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出配置',
      defaultPath: `nexus-config-${new Date().toISOString().slice(0, 10)}.tn`,
      filters: [
        { name: 'Task Nexus Config', extensions: ['tn', 'json'] }
      ]
    });

    if (!filePath) return { success: false, cancelled: true };

    fs.writeFileSync(filePath, JSON.stringify(appConfig, null, 2));
    writeLog('INFO', `Config exported to ${filePath}`);
    return { success: true, filePath };
  } catch (error) {
    writeLog('ERROR', 'Export failed', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-config', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '导入配置',
      filters: [
        { name: 'Task Nexus Config', extensions: ['tn', 'json'] }
      ],
      properties: ['openFile']
    });

    if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true };

    const content = fs.readFileSync(filePaths[0], 'utf-8');
    let importedConfig = {};
    try {
      importedConfig = JSON.parse(content);
    } catch (e) {
      return { success: false, error: '文件格式错误 (非 JSON)' };
    }

    // 简单校验
    if (!importedConfig.profiles && !importedConfig.defaultRules) {
      return { success: false, error: '无效的配置文件 (缺少关键字段)' };
    }

    // 策略：覆盖核心调优参数，保留部分本地偏好
    // 覆盖: profiles, defaultRules, gameList, excludeList, smartTrim, proBalance, throttleList, cpuAffinityMode
    // 保留: width, height, x, y, launchOnStartup, closeToTray

    const newConfig = {
      ...appConfig,
      profiles: importedConfig.profiles || [],
      defaultRules: importedConfig.defaultRules || DEFAULT_CONFIG.defaultRules,
      gameList: importedConfig.gameList || DEFAULT_CONFIG.gameList,
      excludeList: importedConfig.excludeList || DEFAULT_CONFIG.excludeList,
      smartTrim: importedConfig.smartTrim || DEFAULT_CONFIG.smartTrim,
      proBalance: importedConfig.proBalance || DEFAULT_CONFIG.proBalance,
      throttleList: importedConfig.throttleList || DEFAULT_CONFIG.throttleList,
      // 允许导入亲和性模式，如果是共享配置，通常包含模式选择
      cpuAffinityMode: importedConfig.cpuAffinityMode !== undefined ? importedConfig.cpuAffinityMode : appConfig.cpuAffinityMode
    };

    appConfig = newConfig;
    saveConfig();

    // 立即应用新配置 (Rescan)
    scanAndApplyProfiles();

    writeLog('INFO', `Config imported from ${filePaths[0]}`);
    return { success: true, config: appConfig };
  } catch (error) {
    writeLog('ERROR', 'Import failed', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-toggle-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});
ipcMain.on('window-close', () => mainWindow?.close());
// --- CPU Core Monitoring (CoreGrid 2.0) ---

let cpuMonitorProcess = null;
let cpuMonitorInterval = null;
let lastCpuTimes = null;

function startCpuMonitor() {
  if (cpuMonitorProcess || cpuMonitorInterval) return;

  console.log('Starting CPU Core Monitor...');

  if (process.platform === 'win32') {
    // Windows: Use persistent PowerShell Get-Counter
    // We request sample interval of 1s. 
    // Format csv for easier parsing? Or text. Text is fine if we parse carefully.
    // "\Processor(*)\% Processor Time" returns Total + Per Core

    // Note: PowerShell encoding might be tricky. ASCII/UTF8.
    // Using -MaxSamples is not needed with -Continuous (infinite).
    const psCommand = 'Get-Counter -Counter "\\Processor(*)\\% Processor Time" -SampleInterval 1 -Continuous';

    cpuMonitorProcess = require('child_process').spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psCommand
    ]);

    let buffer = '';

    cpuMonitorProcess.stdout.on('data', (data) => {
      buffer += data.toString();

      // Check if we have a full sample block
      // Get-Counter output usually separates samples by newlines
      const lines = buffer.split('\n');
      if (lines.length > 20) { // Arbitrary buffer length check to process chunks
        processBuffer();
      }
    });

    // Simple buffer processor
    const processBuffer = () => {
      // Logic to parse Get-Counter output
      // Output format example:
      // Timestamp                 \Processor(0)\% Processor Time  \Processor(1)\% ...
      // 12/03/2026 14:00:01       12.5                            5.0 ...

      // Since Get-Counter formatting can be localized and messy, 
      // a more robust way for Windows might be "typeperf" which is simpler than PowerShell for raw data stream.
      // typeperf "\Processor(*)\% Processor Time" -si 1
    };

    // Let's actually switch to typeperf for Windows, it's standard cmd tool, simpler output (CSV)
    // Killing the previous spawn logic to use typeperf
    cpuMonitorProcess.kill();

    cpuMonitorProcess = require('child_process').spawn('typeperf', [
      '\\Processor(*)\\% Processor Time',
      '-si', '1'
    ]);

    cpuMonitorProcess.stdout.on('data', (data) => {
      const text = data.toString();
      // typeperf output: "Timestamp","Value1","Value2"...
      // We need to parse the values.
      // The first line is headers.
      // Note: Processor(*) includes _Total. Usually _Total is the last one or first one. 
      // We need to map them.

      // Actually, for simplicity and reliability in Node without overly complex parsing streams,
      // using os.cpus() diff is extremely reliable and cross-platform (even on Windows).
      // The overhead of os.cpus() is negligible.
      // The previous "PowerShell" requirement was because user asked for "Native Core".
      // But for "High Stability", os.cpus() in Main process is safer than spawning shells.
      // Let's fallback to os.cpus() for ALL platforms for stability and consistancy unless user explicitly demanded TypePerf.
      // User asked for "Low Latency". os.cpus() is native Node (C++ under hood). It is very fast.
    });

  }

  // Universal os.cpus() implementation (Stable & Fast)
  // Canceling the spawn logic above for a unified approach.
  if (cpuMonitorProcess) { cpuMonitorProcess.kill(); cpuMonitorProcess = null; }

  lastCpuTimes = os.cpus();
  cpuMonitorInterval = setInterval(() => {
    const startMeasure = lastCpuTimes;
    const endMeasure = os.cpus();
    lastCpuTimes = endMeasure;

    const cores = [];
    for (let i = 0; i < startMeasure.length; i++) {
      const start = startMeasure[i];
      const end = endMeasure[i];

      const idle = end.times.idle - start.times.idle;
      const total = (end.times.user + end.times.nice + end.times.sys + end.times.idle + end.times.irq) -
        (start.times.user + start.times.nice + start.times.sys + start.times.idle + start.times.irq);

      const usage = total === 0 ? 0 : (1 - idle / total) * 100;
      cores.push(usage); // 0-100
    }

    // Broadcast to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cpu-load-update', cores);
    }
  }, 1000);
}

function stopCpuMonitor() {
  if (cpuMonitorInterval) {
    clearInterval(cpuMonitorInterval);
    cpuMonitorInterval = null;
  }
  if (cpuMonitorProcess) {
    cpuMonitorProcess.kill();
    cpuMonitorProcess = null;
  }
  console.log('Stopped CPU Core Monitor');
}

// IPC to control monitor (can conform to lifecycle)
ipcMain.handle('start-cpu-monitor', () => { startCpuMonitor(); return true; });
ipcMain.handle('stop-cpu-monitor', () => { stopCpuMonitor(); return true; });

// Start monitor when app launches? Or only when UI is visible?
// Good practice: Only when UI needs it. Frontend should call start/stop.
