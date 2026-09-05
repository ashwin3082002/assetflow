import { client } from './client';
import type { AdminDashboardData, EmployeeDashboardData, StaffDashboardData } from '../types';

/** Mirrors docs/api-design.md §10. Each endpoint is gated to its role server-side. */

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const res = await client.get<{ data: AdminDashboardData }>('/dashboard/admin');
  return res.data.data;
}

export async function getStaffDashboard(): Promise<StaffDashboardData> {
  const res = await client.get<{ data: StaffDashboardData }>('/dashboard/staff');
  return res.data.data;
}

export async function getEmployeeDashboard(): Promise<EmployeeDashboardData> {
  const res = await client.get<{ data: EmployeeDashboardData }>('/dashboard/employee');
  return res.data.data;
}
