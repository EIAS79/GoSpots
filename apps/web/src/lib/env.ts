import { getApiBaseUrl } from "./api-base-url";

export const env = {
  apiUrl: getApiBaseUrl(),
} as const;
