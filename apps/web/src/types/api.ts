export type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export type ApiRootResponse = {
  name: string;
  version: string;
  docs: string;
};
