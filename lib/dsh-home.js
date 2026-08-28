/** Resolve the Harness home without binding tests or source builds to ~/.dsh. */
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
/**
 * Resolve DSH_HOME exactly once at a path boundary. An unset or blank value
 * preserves the historic ~/.dsh location; a relative override is resolved
 * against the launching process cwd, matching ordinary Node path semantics.
 */
export function resolveDshHome(env = process.env, fallbackHome = homedir()) {
    const configured = env.DSH_HOME?.trim();
    if (configured === undefined || configured === '')
        return join(fallbackHome, '.dsh');
    return isAbsolute(configured) ? configured : resolve(configured);
}
