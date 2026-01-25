我将把“游戏画面设置”功能添加到应用程序中，作为一个新的标签页。

### 1. 新建组件：`src/components/GameGraphicsPanel.tsx`
我将创建一个包含截图中所有功能的 UI 组件：
- **全局画质方案 (Quality Profile)**：包含“三高竞技”、“极低”、“中等”、“极高”和“自定义”的卡片选择器。
- **显示与性能 (Display & Perf)**：
  - 下拉菜单：窗口模式、分辨率、DLSS/超分辨率。
  - 滑块：帧率上限 (FPS Cap) 和 渲染比例 (Render Scale)。
- **竞技与黑科技 (Competitive & Tweaks)**：
  - **NVIDIA Reflex** 开关。
  - **8改4 优化**（占位符开关，等待具体逻辑）。
  - **石头奶 (Stone Milk)**（占位符开关，等待具体逻辑）。
- **细节参数微调 (Fine Tuning)**：
  - **几何与模型**：建模精度、曲面细分、贴图质量的滑块。
  - **光影与特效**：特效品质、光照质量、阴影质量的滑块。

### 2. 更新应用状态：`src/types.ts`
我将定义数据结构来存储这些新设置，以便后续保存/加载：
```typescript
export interface GameGraphicsSettings {
    qualityProfile: string; // 画质方案
    windowMode: string;     // 窗口模式
    resolution: string;     // 分辨率
    fpsCap: number;         // 帧率上限
    renderScale: number;    // 渲染比例
    dlssMode: string;       // DLSS模式
    reflex: boolean;        // Reflex开关
    optimize8to4: boolean;  // 8改4 (占位)
    stoneMilk: boolean;     // 石头奶 (占位)
    // ... 详细微调参数
}
```

### 3. 集成到主应用：`src/App.tsx`
- 在顶部导航栏添加一个新的标签页 **“游戏画面”**。
- 当点击该标签时，渲染新的 `GameGraphicsPanel` 组件。

我将优先实现 UI 界面，占位功能将预留开关，等待您提供具体实现细节后再接入后端。
