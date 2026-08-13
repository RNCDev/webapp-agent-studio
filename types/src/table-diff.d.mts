/**
 * @param {TableRows} actual
 * @param {TableFixture} fixture
 */
export function diffTable(actual: TableRows, fixture: TableFixture): {
    ok: boolean;
    differences: {
        label: string;
        column: string;
        expected: unknown;
        actual: unknown;
        delta: number;
    }[];
    drifts: {
        label: string;
        column: string;
        expected: unknown;
        actual: unknown;
        delta: number;
        reason: string;
    }[];
};
/** @param {ReturnType<typeof diffTable>} result */
export function formatDiff(result: ReturnType<typeof diffTable>): string;
export type TableRows = Record<string, Record<string, number>>;
export type TableFixture = {
    rows: TableRows;
    tolerance?: number;
    exactColumns?: string[];
    knownDrift?: {
        label: string;
        column: string;
        reason: string;
    }[];
};
