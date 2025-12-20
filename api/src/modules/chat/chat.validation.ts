import { z } from "zod";

export const createChatSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    organizationId: z.string().uuid().optional(),
  }),
});

export const updateChatSchema = z.object({
  body: z.object({
    title: z.string().min(1),
  }),
});

export const createMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1),
    role: z.enum(["user", "assistant", "system"]).optional(),
    model: z.string().optional(),
    apiKey: z.string().optional(),
  }),
});

export const createWorkerMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1),
    role: z.enum(["user", "assistant", "system"]),
  }),
});
