import { adminService } from "./admin";

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, string | number | boolean>;
  created_at: string;
  timestamp: string;
  user: {
    email: string;
    display_name: string | null;
    full_name?: string;
  } | null;
}

export const getAuditLogs = async (): Promise<any[]> => {
  return await adminService.getAuditLogs();
};

export const exportAuditLogs = async (): Promise<void> => {
  // For CSV export in a serverless way, we fetch data and generate blob on client
  const result = await getAuditLogs();
  const headers = [
    "id",
    "user_id",
    "action",
    "resource_type",
    "resource_id",
    "created_at",
  ];
  const csvRows = [headers.join(",")];

  result.forEach((log) => {
    const row = [
      log.id,
      log.user_id,
      log.action,
      log.resource_type,
      log.resource_id,
      log.created_at,
    ];
    csvRows.push(row.join(","));
  });

  const url = window.URL.createObjectURL(
    new Blob([csvRows.join("\n")], { type: "text/csv" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "audit_logs.csv");
  document.body.appendChild(link);
  link.click();
  link.remove();
};
