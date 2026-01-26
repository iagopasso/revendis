export type ListResponse<T = unknown> = {
  data: T[];
  meta?: { message?: string };
};

export type ItemResponse<T = unknown> = {
  data: T;
};

export type ErrorResponse = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ProductInput = {
  name: string;
  sku: string;
  brand?: string;
  barcode?: string;
  price: number;
  cost?: number;
  stock?: number;
  expiresAt?: string;
  categoryId?: string;
  active?: boolean;
};

export type ProductUpdateInput = {
  name?: string;
  sku?: string;
  brand?: string;
  barcode?: string;
  price?: number;
  cost?: number;
  expiresAt?: string;
  active?: boolean;
  categoryId?: string;
};

export type CategoryInput = {
  name: string;
  color?: string;
};

export type CategoryUpdateInput = {
  name?: string;
  color?: string;
};

export type InventoryAdjustmentInput = {
  sku: string;
  quantity: number;
  reason: string;
  storeId?: string;
};

export type InventoryTransferInput = {
  sku: string;
  quantity: number;
  fromStoreId: string;
  toStoreId: string;
};

export type InventoryReturnInput = {
  saleId: string;
  items: Array<{ sku: string; quantity: number }>;
  condition?: 'good' | 'damaged';
};

export type SaleItem = {
  sku: string;
  quantity: number;
  price: number;
};

export type Payment = {
  method: string;
  amount: number;
};

export type SaleInput = {
  storeId?: string;
  items: SaleItem[];
  discounts?: Array<Record<string, unknown>>;
  payments?: Payment[];
};

export type ReceivableInput = {
  saleId: string;
  amount: number;
  dueDate: string;
  method?: string;
};

export type ReceivableSettleInput = {
  amount: number;
  settledAt: string;
};

export type CustomerInput = {
  name: string;
  phone: string;
  email?: string;
};

export type StorefrontOrderInput = {
  items: SaleItem[];
  customer: {
    name: string;
    phone?: string;
    email?: string;
  };
  shipping?: {
    address?: string;
    price?: number;
  };
};
