import type { WorkspaceApi } from '../shared/types';

declare global {
  interface Window {
    api: WorkspaceApi;
  }
}

export {};
