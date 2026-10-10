import type { DeviceStatus } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

/** Each linked shop PC's desktop version and last contact (online, super-admin). */
export const listDeviceStatus = () => api<DeviceStatus[]>("/api/devices");
