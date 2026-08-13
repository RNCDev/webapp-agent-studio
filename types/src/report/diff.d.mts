/**
 * @param {any} previous results.json of the previous run, or undefined for a first run
 * @param {any} current
 */
export function diffRuns(previous: any, current: any): {
    previousRun: null;
    regressed: never[];
    recovered: never[];
    added: any;
    removed: never[];
    slower: never[];
    screenshots: ReturnType<typeof diffScreenshots>;
    note: string;
} | {
    previousRun: any;
    regressed: {
        name: string;
        from: string;
        to: string;
    }[];
    recovered: {
        name: string;
        from: string;
        to: string;
    }[];
    added: string[];
    removed: string[];
    slower: {
        name: string;
        was: number;
        now: number;
    }[];
    screenshots: ReturnType<typeof diffScreenshots>;
    note: string;
};
/**
 * Which screenshots changed since the previous run.
 *
 * COARSE ON PURPOSE, AND HONEST ABOUT IT. This compares file bytes, not perception: two
 * images that differ by one antialiased pixel count as changed. It exists to turn "look at
 * everything" into "look at these four" for a UI regression that breaks no check and no
 * axe rule — it is a pointer for a human, never a verdict, and it never touches the exit
 * code. A true perceptual hash needs a PNG decoder, which would cost a dependency this
 * package does not spend.
 *
 * @param {string} previousDir
 * @param {string} currentDir
 * @param {{name: string, file: string}[]} files
 */
export function diffScreenshots(previousDir: string, currentDir: string, files: {
    name: string;
    file: string;
}[]): {
    file: string;
    status: "changed" | "same" | "new";
    sizeDeltaPct?: number;
}[];
