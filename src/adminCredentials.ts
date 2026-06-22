// 内置管理员账号。仅用于读取项目数据、需求列表、任务列表和详情；
// 个人账号只用于项目列表和项目选择。
//
// 注意：这是源码内写死的凭据，请勿提交真实账号到公共仓库，也勿在日志或
// 普通 VS Code 配置中输出。如需更换，修改下方常量即可。
export const ADMIN_ACCOUNT = 'plugin-admin';
export const ADMIN_PASSWORD = 'change-me';

export interface AdminCredentials {
  account: string;
  password: string;
}

export function getAdminCredentials(): AdminCredentials {
  return { account: ADMIN_ACCOUNT, password: ADMIN_PASSWORD };
}
