import { from, concat, of } from "rxjs";
import { filter, map, shareReplay, catchError } from "rxjs/operators";
import {
  syncstorageChange$,
  localstorageChange$,
  safeStorageGet,
} from "../models/storage";

// preferences$
export const fromStorage$ = from(safeStorageGet("sync", "preferences")).pipe(
  filter((storage) => !!storage.preferences),
  map((storage) => storage.preferences!),
  catchError((error) => {
    console.error("Error getting preferences from storage:", error);
    return of(null);
  }),
  filter(Boolean)
);

const preferencesChange$ = syncstorageChange$.pipe(
  // filter only sync storage
  filter(([change]) => !!change.preferences),
  // get newValue object
  map(([change]) => change.preferences!.newValue)
);

export const preferences$ = concat(fromStorage$, preferencesChange$).pipe(
  shareReplay(1)
);

// env$
export const fromLocalStorage$ = from(safeStorageGet("local", "env")).pipe(
  filter((storage) => !!storage.env),
  map((storage) => storage.env!),
  catchError((error) => {
    console.error("Error getting env from storage:", error);
    return of(null);
  }),
  filter(Boolean)
);

const envChange$ = localstorageChange$.pipe(
  // filter only sync storage
  filter(([change]) => !!change.env),
  // get newValue object
  map(([change]) => change.env!.newValue)
);

export const env$ = concat(fromLocalStorage$, envChange$).pipe(shareReplay(1));

// wait$
const waitStateFromLocalStorage$ = from(safeStorageGet("sync", "wait")).pipe(
  filter((storage) => !!storage.wait),
  map((storage) => storage.wait!),
  catchError((error) => {
    console.error("Error getting wait state from storage:", error);
    return of(null);
  }),
  filter(Boolean)
);

const waitStateChange$ = syncstorageChange$.pipe(
  filter(([change]) => !!change.wait),
  map(([change]) => change.wait!.newValue)
);

export const wait$ = concat(waitStateFromLocalStorage$, waitStateChange$).pipe(
  shareReplay(1)
);

const loginStateFromLocalStorage$ = from(
  safeStorageGet("local", "loginState")
).pipe(
  filter((storage) => !!storage.loginState),
  map((storage) => storage.loginState),
  catchError((error) => {
    console.error("Error getting loginState from storage:", error);
    return of(null);
  }),
  filter(Boolean)
);

const loginStateChange$ = localstorageChange$.pipe(
  filter(([change]) => !!change.loginState),
  map(([change]) => change.loginState!.newValue)
);

export const loginState$ = concat(
  loginStateFromLocalStorage$,
  loginStateChange$
).pipe(shareReplay(1));

export const fromLocalStorageSync$ = from(
  safeStorageGet("sync", "syncparams")
).pipe(
  filter((sync) => !!sync.syncparams),
  map((sync) => sync.syncparams!),
  catchError((error) => {
    console.error("Error getting syncparams from storage:", error);
    return of(null);
  }),
  filter(Boolean)
);

export const SyncChange$ = syncstorageChange$.pipe(
  filter(([change]) => !!change.syncparams && !!change.syncparams.newValue),
  map(([change]) => change.syncparams!.newValue!)
);

const sid$ = from(safeStorageGet("local", "socketidzyh")).pipe(
  filter((socketid) => !!socketid.socketidzyh),
  map((socketid) => socketid.socketidzyh!),
  catchError((error) => {
    console.error("Error getting socketidzyh from storage:", error);
    return of(null);
  }),
  filter(Boolean)
);

const activitiesLocal$ = from(safeStorageGet("local", "activities")).pipe(
  filter((storage) => !!storage.activities),
  map((storage) => storage.activities!),
  catchError((error) => {
    console.error("Error getting activities from storage:", error);
    return of(null);
  }),
  filter(Boolean)
);

const SyncChangeWithOldValue$ = syncstorageChange$.pipe(
  filter(([change]) => !!change.syncparams && !!change.syncparams.newValue),
  map(([change]) => change.syncparams)
);

const sidChangeFromLocalStorage$ = localstorageChange$.pipe(
  filter(([change]) => !!change.socketidzyh && !!change.socketidzyh.newValue),
  map(([change]) => change.socketidzyh!.newValue!)
);

export const syncState$ = concat(fromLocalStorageSync$, SyncChange$).pipe(
  shareReplay(1)
);

export const syncStateInbg$ = concat(
  fromLocalStorageSync$,
  sid$,
  SyncChangeWithOldValue$
).pipe(shareReplay(1));

// tslint:disable-next-line:max-line-length
export const sidChange$ = concat(
  sid$,
  fromLocalStorageSync$,
  activitiesLocal$,
  sidChangeFromLocalStorage$
).pipe(shareReplay(1));
export const storageSyncConfig$ = from(
  safeStorageGet("sync", "syncConfig")
).pipe(
  filter((storage) => !!storage.syncConfig),
  map((storage) => storage.syncConfig!),
  catchError((error) => {
    console.error("Error getting syncConfig from storage:", error);
    return of(null);
  }),
  filter(Boolean)
);
