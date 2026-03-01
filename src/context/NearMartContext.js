/**
 * NearMartContext.js — Compatibility shim
 * All state is now managed by GlobalStore.js
 * This file re-exports so existing SCM imports continue to work.
 */
export { GlobalStoreProvider as NearMartProvider, useNearMart } from "./GlobalStore";
