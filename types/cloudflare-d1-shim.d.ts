interface D1Result<T = Record<string, unknown>> {
    results?: T[];
    success?: boolean;
    meta?: Record<string, unknown>;
}

interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    run(): Promise<D1Result<never>>;
}

interface D1Database {
    prepare(query: string): D1PreparedStatement;
}
