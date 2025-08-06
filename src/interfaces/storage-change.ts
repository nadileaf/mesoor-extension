export type StorageChange<P> = {
  [K in keyof P]?: {
    oldValue: P[K];
    newValue: P[K];
  };
};
