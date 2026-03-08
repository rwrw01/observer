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
});

/** Schema for HAR file import */
export const harImportSchema = z.object({
  filePath: z.string().min(1).max(1000),
  name: z.string().min(1).max(200).trim().optional(),
  apiFilter: z.string().min(1).max(500).default('/api/'),
});

/** Schema for port configuration */
export const portSchema = z.number().int().min(1024).max(65535).default(3300);

export type SessionConfigInput = z.infer<typeof sessionConfigSchema>;
export type HarImportInput = z.infer<typeof harImportSchema>;
