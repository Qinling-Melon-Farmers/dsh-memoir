/** Resolve the Harness home without binding tests or source builds to ~/.dsh. */
/**
 * Resolve DSH_HOME exactly once at a path boundary. An unset or blank value
 * preserves the historic ~/.dsh location; a relative override is resolved
 * against the launching process cwd, matching ordinary Node path semantics.
 */
export declare function resolveDshHome(env?: Readonly<Record<string, string | undefined>>, fallbackHome?: string): string;
