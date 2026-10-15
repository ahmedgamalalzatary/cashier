export type SalaryAdjustmentType = "bonus" | "deduction";
export type SalaryAdvance = {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: string;
  entryDate: string;
  note: string | null;
  recordedByName: string;
  createdAt: string;
};
export type SalaryAdjustment = SalaryAdvance & { type: SalaryAdjustmentType };
export type SalaryPayment = {
  id: string;
  employeeId: string;
  employeeName: string;
  periodMonth: string;
  basePay: string;
  bonuses: string;
  deductions: string;
  advances: string;
  netPay: string;
  paidByName: string;
  paidAt: string;
};
/** why a month row has no salary figure — null when the row is payable or paid */
export type SalaryBlockedReason = "no_salary" | "month_closed" | "invalid_data";
export type SalaryMonthEmployee = {
  employeeId: string;
  employeeName: string;
  isActive: boolean;
  /** monthly salary — null means the salary was never set */
  payRate: string | null;
  basePay: string | null;
  bonuses: string;
  deductions: string;
  advances: string;
  netPay: string | null;
  payment: SalaryPayment | null;
  blockedReason: SalaryBlockedReason | null;
  /** only for `invalid_data`: what exactly is broken */
  blockedMessage: string | null;
  /** months left unpaid before this one that this payment would lock for good */
  unpaidEarlierMonths: number;
};
export type SalaryMonth = {
  month: string;
  employees: SalaryMonthEmployee[];
  advances: SalaryAdvance[];
  adjustments: SalaryAdjustment[];
  payments: SalaryPayment[];
};
