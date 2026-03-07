// SmartExcel 插件使用次数限制工具
// 临时用户可以免费使用 3 次，超过后需要登录付费

const STORAGE_KEY = 'smartexcel_usage_count';
const FREE_LIMIT = 3;

// 主站登录页面 URL
const LOGIN_URL = 'https://smarterexcel.com/auth/login';

interface UsageInfo {
  count: number;
  firstUsedAt: number;
}

/**
 * 获取使用次数信息
 */
function getUsageInfo(): UsageInfo {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // 忽略解析错误
  }
  return { count: 0, firstUsedAt: Date.now() };
}

/**
 * 保存使用次数信息
 */
function saveUsageInfo(info: UsageInfo): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  } catch {
    // 忽略存储错误
  }
}

/**
 * 检查是否可以导出
 * 返回 { allowed: true } 如果可以导出
 * 返回 { allowed: false, remaining: number } 如果不能导出，需要登录
 */
export function checkExportLimit(): { allowed: boolean; remaining: number } {
  const info = getUsageInfo();
  const remaining = FREE_LIMIT - info.count;

  if (remaining > 0) {
    return { allowed: true, remaining };
  }

  return { allowed: false, remaining: 0 };
}

/**
 * 记录一次使用
 * 应该在导出成功后调用
 */
export function recordUsage(): void {
  const info = getUsageInfo();
  info.count += 1;
  saveUsageInfo(info);
}

/**
 * 获取剩余次数
 */
export function getRemainingCount(): number {
  const info = getUsageInfo();
  return Math.max(0, FREE_LIMIT - info.count);
}

/**
 * 检查是否需要登录
 */
export function needsLogin(): boolean {
  const info = getUsageInfo();
  return info.count >= FREE_LIMIT;
}

/**
 * 跳转到登录页面，登录后跳转回原页面
 */
export function redirectToLogin(): void {
  // 获取当前页面 URL 作为回调地址
  const currentUrl = window.location.href;

  // 构建登录 URL，包含回调参数
  const loginUrl = new URL(LOGIN_URL);
  loginUrl.searchParams.set('callbackUrl', currentUrl);

  // 跳转到登录页面
  window.location.href = loginUrl.toString();
}

/**
 * 检查并处理导出限制
 * 如果已达限制，返回 false 并跳转登录
 * 否则记录使用并返回 true
 */
export function checkAndRecordUsage(): boolean {
  const { allowed, remaining } = checkExportLimit();

  if (!allowed) {
    // 超过限制，跳转到登录
    redirectToLogin();
    return false;
  }

  // 记录这次使用
  recordUsage();

  console.log(`[SmartExcel] 已使用 ${getRemainingCount()} 次，剩余 ${Math.max(0, FREE_LIMIT - getRemainingCount())} 次`);

  return true;
}
