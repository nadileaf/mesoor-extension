export type Preferences = {
  version: number;
  disabled: boolean;
};

export interface SyncParams {
  [origin: string]: {
    isSync: boolean;
  };
}

export interface SyncConfig {
  [origin: string]: boolean;
}

export interface IUser {
  host: string;
  token: string;
  username?: string;
  id: string;
  avatar?: string;
}

export interface TipUser {
  sub: string;
  tenantId: number;
  tenantAlias: string;
  exp: number;
  userId: string;
  iat: number;
  token: string;
}

export interface IActivities {
  [origin: string]: {
    active: boolean;
    account?: string;
    email?: string;
    phone?: string;
    timestamp: number;
  };
}

export interface WaitState {
  isSyncWait: boolean;
}

// tslint:disable-next-line:max-line-length
export type SyncStorage = {
  preferences?: Preferences;
  user?: IUser;
  syncparams?: SyncParams;
  syncConfig?: SyncConfig;
  wait?: WaitState;
};
// tslint:disable-next-line:max-line-length
export type LocalStorage = {
  env?: string;
  activities?: IActivities;
  loginState?: { [url: string]: number };
  socketidzyh?: string;
};
