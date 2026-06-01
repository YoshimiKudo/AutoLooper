import type { AutoLooperApi } from "../preload/index";

declare global {
  interface Window {
    autoLooper: AutoLooperApi;
  }
}

export {};
