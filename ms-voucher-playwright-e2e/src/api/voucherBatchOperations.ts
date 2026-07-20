import { z } from 'zod';

export const voucherBatchOperationStatusSchema = z.enum([
  'NOT_STARTED',
  'RUNNING',
  'COMPLETED',
  'ERROR'
]);

export const voucherBatchItemSchema = z.object({
  id: z.string(),
  creationDate: z.string(),
  lastUpdateDate: z.string(),
  operationId: z.string(),
  voucherCode: z.string(),
  status: voucherBatchOperationStatusSchema,
  message: z.string().nullable()
}).passthrough();

export const voucherBatchOperationSchema = z.object({
  id: z.string(),
  creationDate: z.string(),
  lastUpdateDate: z.string(),
  operation: z.literal('BLOCK'),
  status: voucherBatchOperationStatusSchema,
  caseId: z.string().nullable().optional(),
  validationChannel: z.string().nullable().optional(),
  codeResale: z.string().nullable().optional(),
  addressValidation: z.string().nullable().optional(),
  documentResale: z.string().nullable().optional(),
  userType: z.string().nullable().optional(),
  codeProduct: z.string().nullable().optional(),
  orderLatitude: z.string().nullable().optional(),
  orderLongitude: z.string().nullable().optional(),
  consumerDocument: z.string().nullable().optional(),
  consumerPhoneNumber: z.string().nullable().optional(),
  webhookUrl: z.string().nullable().optional(),
  items: z.array(voucherBatchItemSchema)
}).passthrough();

export type VoucherBatchOperationStatus = z.infer<typeof voucherBatchOperationStatusSchema>;
export type VoucherBatchItem = z.infer<typeof voucherBatchItemSchema>;
export type VoucherBatchOperation = z.infer<typeof voucherBatchOperationSchema>;

export interface VoucherBatchBlockPayload {
  caseId: string;
  validationChannel: string;
  codeResale: string;
  addressValidation: string;
  documentResale: string;
  userType: string;
  codeProduct: string;
  orderLatitude?: string;
  orderLongitude?: string;
  consumerDocument?: string;
  consumerPhoneNumber?: string;
  webhookUrl?: string;
  vouchers: string[];
}

export interface BatchRequestOptions {
  /** null omite o header; undefined usa o idioma configurado para a suíte. */
  acceptLanguage?: string | null;
}

export const TERMINAL_BATCH_STATUSES: ReadonlySet<VoucherBatchOperationStatus> = new Set([
  'COMPLETED',
  'ERROR'
]);
