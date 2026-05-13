import { Direction } from "@prisma/client";
import { z } from "zod";

const directionSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .transform((value) => {
    if (value === "long") return Direction.LONG;
    if (value === "short") return Direction.SHORT;
    return Direction.NEUTRAL;
  });

export const tradingViewAlertSchema = z.object({
  symbol: z.string().min(1).max(32),
  timeframe: z.string().max(16).optional().nullable(),
  price: z.coerce.number().optional().nullable(),
  signal: z.string().min(1).max(100),
  direction: directionSchema,
  indicator: z.string().max(100).optional().nullable(),
  message: z.string().max(1000).optional().nullable(),
});
