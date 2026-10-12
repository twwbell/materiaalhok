export type Category = { id: number; name: string };

export type Item = {
  id: number;
  name: string;
  categoryId: number;
  stock: number;
  available: number;
  /** earliest return date (YYYY-MM-DD) of the lent-out units, if any */
  back: string | null;
  thumb: string | null;
  large: string | null;
};

export type Catalog = {
  categories: Category[];
  items: Item[];
  today: string;
  maxDays: number;
};

export type LoanStatus = "Open" | "Terug" | "Deels terug" | "Beschadigd";

export type LoanLine = {
  id: number;
  materialId: number;
  name: string;
  qty: number;
  returned: number;
};

export type Loan = {
  id: number;
  number: string;
  name: string;
  email: string;
  due: string;
  status: LoanStatus;
  token: string;
  lastReminder: string | null;
  lines: LoanLine[];
};
