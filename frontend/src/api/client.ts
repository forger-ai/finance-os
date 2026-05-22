export * from "./utils";
export { request as get } from "./utils";
import { request } from "./utils";

export const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: "POST", body, signal });
export const patch = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: "PATCH", body, signal });
export const put = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: "PUT", body, signal });
export const del = <T>(path: string, signal?: AbortSignal) =>
  request<T>(path, { method: "DELETE", signal });
