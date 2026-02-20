import { executeAction } from '../../composio/client.js';

/**
 * GoHighLevel connector for fetching contacts, opportunities, and conversations via Composio
 */
export class GHLConnector {
    constructor(
        private connectedAccountId: string,
        private locationId: string
    ) {}

    /**
     * Fetch contacts from GoHighLevel with pagination
     * Uses cursor-based pagination (startAfter timestamp)
     */
    async *fetchContacts(since?: Date): AsyncGenerator<Record<string, unknown>[]> {
        let cursor: string | undefined = since?.toISOString();
        let hasMore = true;

        while (hasMore) {
            const input: Record<string, unknown> = {
                locationId: this.locationId,
                limit: 100,
            };

            if (cursor) {
                input.startAfter = cursor;
            }

            const result = await executeAction(
                'GOHIGHLEVEL_GET_CONTACTS',
                this.connectedAccountId,
                input
            );

            if (!result.success) {
                throw new Error(`Failed to fetch contacts: ${result.error || 'Unknown error'}`);
            }

            const data = result.data as Record<string, unknown>;
            const contacts = (data?.contacts || data?.data || []) as Record<string, unknown>[];

            if (contacts.length > 0) {
                yield contacts;
            }

            // Check for next cursor/page
            const meta = (data?.meta || data?.pagination) as Record<string, unknown> | undefined;
            if (meta?.nextCursor || meta?.next) {
                cursor = String(meta.nextCursor || meta.next);
            } else {
                hasMore = false;
            }

            // Stop if we got fewer results than the limit
            if (contacts.length < 100) {
                hasMore = false;
            }
        }
    }

    /**
     * Fetch opportunities from GoHighLevel with pagination
     * Uses page-based pagination
     */
    async *fetchOpportunities(since?: Date): AsyncGenerator<Record<string, unknown>[]> {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const input: Record<string, unknown> = {
                location_id: this.locationId,
                limit: 100,
                page,
            };

            if (since) {
                input.startDate = since.toISOString();
            }

            const result = await executeAction(
                'GOHIGHLEVEL_SEARCH_OPPORTUNITIES',
                this.connectedAccountId,
                input
            );

            if (!result.success) {
                throw new Error(`Failed to fetch opportunities: ${result.error || 'Unknown error'}`);
            }

            const data = result.data as Record<string, unknown>;
            const opportunities = (data?.opportunities || data?.data || []) as Record<string, unknown>[];

            if (opportunities.length > 0) {
                yield opportunities;
            }

            // Check pagination
            const meta = (data?.meta || data?.pagination) as Record<string, unknown> | undefined;
            const total = Number(meta?.total || 0);
            const currentCount = page * 100;

            if (currentCount >= total || opportunities.length < 100) {
                hasMore = false;
            } else {
                page++;
            }
        }
    }

    /**
     * Fetch conversations from GoHighLevel with pagination
     * Per user decision: Only sync last 30 days
     * Enriches each conversation with recent messages (up to 50)
     */
    async *fetchConversations(since?: Date): AsyncGenerator<Record<string, unknown>[]> {
        // Default to 30 days ago if not specified
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const effectiveSince = since || thirtyDaysAgo;

        let cursor: string | undefined;
        let hasMore = true;

        while (hasMore) {
            const input: Record<string, unknown> = {
                locationId: this.locationId,
                limit: 100,
                startDate: effectiveSince.toISOString(),
            };

            if (cursor) {
                input.cursor = cursor;
            }

            const result = await executeAction(
                'GOHIGHLEVEL_SEARCH_CONVERSATIONS',
                this.connectedAccountId,
                input
            );

            if (!result.success) {
                throw new Error(`Failed to fetch conversations: ${result.error || 'Unknown error'}`);
            }

            const data = result.data as Record<string, unknown>;
            const conversations = (data?.conversations || data?.data || []) as Record<string, unknown>[];

            // Enrich each conversation with messages
            const enrichedConversations = await Promise.all(
                conversations.map(async (conv: Record<string, unknown>) => {
                    try {
                        const messagesResult = await executeAction(
                            'GOHIGHLEVEL_GET_CONVERSATION_MESSAGES',
                            this.connectedAccountId,
                            {
                                conversationId: conv.id,
                                limit: 50,
                            }
                        );

                        if (messagesResult.success) {
                            const messagesData = messagesResult.data as Record<string, unknown>;
                            conv.messages = (messagesData?.messages || messagesData?.data || []) as Record<string, unknown>[];
                        } else {
                            conv.messages = [];
                        }
                    } catch (error) {
                        console.warn(`[GHLConnector] Failed to fetch messages for conversation ${conv.id}:`, error);
                        conv.messages = [];
                    }

                    return conv;
                })
            );

            if (enrichedConversations.length > 0) {
                yield enrichedConversations;
            }

            // Check for next cursor
            const meta = (data?.meta || data?.pagination) as Record<string, unknown> | undefined;
            if (meta?.nextCursor || meta?.next) {
                cursor = String(meta.nextCursor || meta.next);
            } else {
                hasMore = false;
            }

            // Stop if we got fewer results than the limit
            if (conversations.length < 100) {
                hasMore = false;
            }
        }
    }

    /**
     * Get the appropriate fetcher method for an entity type
     */
    getEntityFetcher(entityType: string): ((since?: Date) => AsyncGenerator<Record<string, unknown>[]>) | null {
        switch (entityType.toLowerCase()) {
            case 'contact':
            case 'contacts':
                return this.fetchContacts.bind(this);
            case 'opportunity':
            case 'opportunities':
                return this.fetchOpportunities.bind(this);
            case 'conversation':
            case 'conversations':
                return this.fetchConversations.bind(this);
            default:
                return null;
        }
    }
}
