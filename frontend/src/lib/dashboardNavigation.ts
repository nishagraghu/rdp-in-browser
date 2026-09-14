/** Router state — when set, dashboard shows the VM list instead of auto-connecting. */
export const DASHBOARD_SHOW_LIST_STATE = { showList: true } as const;

export type DashboardLocationState = {
  showList?: boolean;
};
