import { z } from 'zod';

/**
 * System of Record reference (e.g., gohighlevel:contact:abc123, gmail:thread:xyz)
 */
export const SorRefSchema = z.object({
    system: z.string(),
    id: z.string(),
});
export type SorRef = z.infer<typeof SorRefSchema>;

/**
 * Entity alias (name variant, email variant, or SOR ID)
 */
export const EntityAliasSchema = z.object({
    type: z.enum(['name_variant', 'email_variant', 'sor_id']),
    value: z.string(),
    confirmedBy: z.enum(['llm', 'user', 'system']),
    confirmedAt: z.string(), // ISO timestamp
    confidence: z.number().min(0).max(1),
});
export type EntityAlias = z.infer<typeof EntityAliasSchema>;

/**
 * Match signal for explainability (ERES-06)
 */
export const MatchSignalSchema = z.object({
    field: z.enum(['email', 'sorId', 'name_exact', 'name_fuzzy', 'name_phonetic', 'org_domain', 'llm']),
    score: z.number().min(0).max(1),
    weight: z.number().min(0).max(1),
    detail: z.string().optional(),
});
export type MatchSignal = z.infer<typeof MatchSignalSchema>;

/**
 * Entity index entry (canonical entity)
 */
export const EntityIndexEntrySchema = z.object({
    entityId: z.string(), // UUID
    name: z.string(),
    email: z.string().optional(),
    organization: z.string().optional(),
    role: z.string().optional(),
    sorRefs: z.array(SorRefSchema),
    aliases: z.array(EntityAliasSchema),
    confidence: z.number().min(0).max(1),
    lastUpdated: z.string(), // ISO timestamp
    sources: z.array(z.string()), // File paths that contributed
});
export type EntityIndexEntry = z.infer<typeof EntityIndexEntrySchema>;

/**
 * Match result with tier and signals
 */
export const MatchResultSchema = z.object({
    entity: EntityIndexEntrySchema,
    confidence: z.number().min(0).max(1),
    tier: z.enum(['1', '2', '3']),
    signals: z.array(MatchSignalSchema),
    reasoning: z.string().optional(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

/**
 * Entity index with version for future migration support
 */
export const EntityIndexSchema = z.object({
    version: z.literal(1),
    entities: z.array(EntityIndexEntrySchema),
    buildTime: z.string(), // ISO timestamp
});
export type EntityIndex = z.infer<typeof EntityIndexSchema>;

/**
 * Normalize email for matching
 * - Lowercase entire email
 * - For gmail.com/googlemail.com: strip dots from local part, remove +tag, normalize domain to gmail.com
 * - For all others: remove +tag from local part
 */
export function normalizeEmail(email: string): string {
    const trimmed = email.trim().toLowerCase();
    const [localPart, domain] = trimmed.split('@');

    if (!domain) {
        return trimmed; // Invalid email, return as-is
    }

    let normalizedLocal = localPart;

    // Handle gmail-specific normalization
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        // Remove dots
        normalizedLocal = normalizedLocal.replace(/\./g, '');
        // Remove +tag
        const plusIndex = normalizedLocal.indexOf('+');
        if (plusIndex !== -1) {
            normalizedLocal = normalizedLocal.substring(0, plusIndex);
        }
        // Normalize domain to gmail.com
        return `${normalizedLocal}@gmail.com`;
    }

    // For all other domains, just remove +tag
    const plusIndex = normalizedLocal.indexOf('+');
    if (plusIndex !== -1) {
        normalizedLocal = normalizedLocal.substring(0, plusIndex);
    }

    return `${normalizedLocal}@${domain}`;
}

/**
 * Normalize name for matching
 * - Lowercase
 * - Remove punctuation
 * - Collapse whitespace
 * - Sort tokens alphabetically (so "John Smith" == "Smith John")
 */
export function normalizeName(name: string): string {
    const lowercased = name.toLowerCase();
    // Remove punctuation
    const noPunctuation = lowercased.replace(/[.,;:!?\-_(){}[\]]/g, ' ');
    // Collapse whitespace
    const collapsed = noPunctuation.replace(/\s+/g, ' ').trim();
    // Split, sort, and rejoin tokens
    const tokens = collapsed.split(' ').filter(t => t.length > 0);
    tokens.sort();
    return tokens.join(' ');
}
