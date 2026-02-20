/**
 * Retry options configuration
 */
export interface RetryOptions {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    factor: number;
    jitter: 'none' | 'full' | 'equal';
    retryableStatusCodes: number[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    factor: 2,
    jitter: 'full',
    retryableStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * Retryable operation with exponential backoff and jitter
 */
export class RetryableOperation {
    private options: RetryOptions;

    constructor(options?: Partial<RetryOptions>) {
        this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
    }

    /**
     * Calculate delay with exponential backoff and jitter
     */
    private calculateDelay(attempt: number): number {
        const exponentialDelay = Math.min(
            this.options.initialDelay * Math.pow(this.options.factor, attempt - 1),
            this.options.maxDelay
        );

        switch (this.options.jitter) {
            case 'full':
                return Math.random() * exponentialDelay;
            case 'equal':
                return exponentialDelay / 2 + Math.random() * (exponentialDelay / 2);
            case 'none':
            default:
                return exponentialDelay;
        }
    }

    /**
     * Check if error is retryable
     */
    private isRetryable(error: unknown): boolean {
        // Check for HTTP status codes
        if (error?.response?.status) {
            return this.options.retryableStatusCodes.includes(error.response.status);
        }

        // Check for network error codes
        if (error?.code) {
            const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
            return retryableCodes.includes(error.code);
        }

        return false;
    }

    /**
     * Extract Retry-After header value in milliseconds
     */
    private getRetryAfter(error: any): number | null {
        const retryAfter = error?.response?.headers?.['retry-after'];

        if (!retryAfter) {
            return null;
        }

        // Parse as seconds (most common format)
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
            return seconds * 1000;
        }

        // Could also be HTTP-date, but we'll just use default for now
        return null;
    }

    /**
     * Execute function with retry logic
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: any;

        for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                // Check if this is the last attempt
                const isLastAttempt = attempt === this.options.maxAttempts;

                // Check if error is retryable
                if (!this.isRetryable(error)) {
                    console.log('[Retry] Non-retryable error encountered, failing immediately');
                    throw error;
                }

                if (isLastAttempt) {
                    console.log(`[Retry] Max attempts (${this.options.maxAttempts}) reached, failing`);
                    throw error;
                }

                // Calculate delay
                let delay: number;

                // Calculate delay
                const err = error as any;

                // Check for Retry-After header (429 responses)
                if (err?.response?.status === 429) {
                    const retryAfter = this.getRetryAfter(err);
                    if (retryAfter !== null) {
                        delay = retryAfter;
                        console.log(`[Retry] Attempt ${attempt} failed with 429, retrying after ${delay}ms (from Retry-After header)`);
                    } else {
                        delay = this.calculateDelay(attempt);
                        console.log(`[Retry] Attempt ${attempt} failed with 429, retrying after ${delay}ms`);
                    }
                } else {
                    delay = this.calculateDelay(attempt);
                    const errorMessage = err?.message || String(err);
                    console.log(`[Retry] Attempt ${attempt} failed: ${errorMessage}, retrying after ${delay}ms`);
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Should never reach here due to throw in loop, but TypeScript needs this
        throw lastError;
    }
}
