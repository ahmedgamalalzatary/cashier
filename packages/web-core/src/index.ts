// Shared surface for the desktop and online Next apps. Every export here must
// stay client-only: the desktop ships a static export, so no server actions and
// no route handlers.
export * from "./lib/api";
export * from "./lib/auth";
export * from "./lib/branch-session";
export * from "./lib/cairo-date";
export * from "./lib/cn";
export * from "./lib/format";
export * from "./lib/navigation";
export * from "./lib/search";
export * from "./components/ui/badge";
export * from "./components/ui/button";
export * from "./components/ui/confirm-dialog";
export * from "./components/ui/data-table";
export * from "./components/ui/entity-picker";
export * from "./components/ui/field";
export * from "./components/ui/icon-button";
export * from "./components/ui/modal";
export * from "./components/ui/money";
export * from "./components/ui/page-header";
export * from "./components/ui/search-select";
export * from "./components/ui/section";
export * from "./components/ui/select-field";
export * from "./components/ui/stat";
export * from "./components/ui/states";
export * from "./components/ui/table";
export * from "./components/ui/tabs";
export * from "./components/auth/auth-provider";
export * from "./components/branches/branch-provider";
export * from "./components/branches/workspace-bar";
export * from "./components/reports/report-table";
export * from "./components/users/user-modal";
// The component and the row shape share the name ReportTable, so the model
// types are re-exported under distinct names.
export {
  isReportRangeReady,
  reportTotal,
  type Column as ReportColumn,
  type ReportTable as ReportTableData,
} from "./models/reports-model";
export * from "./models/user-model";
export * from "./services/auth-service";
export * from "./services/branches-service";
export * from "./services/reports-service";
export * from "./services/users-service";
export * from "./features/branches-page";
export * from "./features/login-page";
export * from "./features/reports-page";
export * from "./features/users-page";