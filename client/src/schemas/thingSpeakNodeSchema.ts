/**
 * thingSpeakNodeSchema.ts
 *
 * Zod validation schema for the ThingSpeak Node provisioning form.
 *
 * Separated from the component to keep validation logic reusable and testable.
 */

import { z } from 'zod';

export const thingSpeakNodeSchema = z.object({
  channelId: z
    .string()
    .min(1, 'Channel ID is required.')
    .regex(/^\d+$/, 'Channel ID must be a numeric value.'),

  readApiKey: z
    .string()
    .min(1, 'Read API Key is required.')
    .min(16, 'Read API Key seems too short. Double-check it.'),

  selectedFields: z
    .array(z.string().min(1, 'Field selection cannot be empty.'))
    .min(1, 'Select at least one field before submitting.'),
});

export type ThingSpeakNodeFormValues = z.infer<typeof thingSpeakNodeSchema>;
