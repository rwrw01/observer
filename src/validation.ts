import { z } from 'zod';

/** Validate URL with https/http only */
const urlSchema = z.string().min(1).refine(
  (val) => {
    try {
      const parsed = new URL(val);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid http:// or https:// URL' }
);

/** Schema for creating a new observation session */
export const sessionConfigSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  targetUrl: urlSchema,
  apiFilter: z.string().min(1).max(500).default('/api/'),
  captureAuthHeaders: z.boolean().default(false),
});

/** Schema for HAR file import — filePath restricted to safe extensions */
export const harImportSchema = z.object({
  filePath: z.string().min(1).max(1000)
    .refine((val) => !val.includes('\0'), { message: 'Path must not contain null bytes' })
    .refine((val) => /\.(har|json)$/i.test(val), { message: 'File must have .har or .json extension' }),
  name: z.string().min(1).max(200).trim().optional(),
  apiFilter: z.string().min(1).max(500).default('/api/'),
});

/** Schema for data extraction configuration */
export const extractConfigSchema = z.object({
  sessionId: z.number().int().min(1),
  endpoints: z.array(z.string().min(1).max(2000)).min(1).max(100),
  baseUrl: urlSchema,
  delayMs: z.number().int().min(500).max(60000).default(3000),
  jitterPercent: z.number().int().min(0).max(50).default(30),
  maxRequests: z.number().int().min(1).max(10000).default(1000),
  maxErrorRate: z.number().int().min(5).max(100).default(20),
});

/** Schema for port configuration */
export const portSchema = z.number().int().min(1024).max(65535).default(3300);

export type SessionConfigInput = z.infer<typeof sessionConfigSchema>;
export type HarImportInput = z.infer<typeof harImportSchema>;
export type ExtractConfigInput = z.infer<typeof extractConfigSchema>;
