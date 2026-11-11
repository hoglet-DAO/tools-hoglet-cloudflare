/**
 * The last package size the compile service measured for exactly these sources and options.
 *
 * Before the first compile the workspace can only show the source size, which runs about three times the
 * compiled artifact size and reads like the real number anyway. The compiler is deterministic, so the size
 * measured for a given set of sources still holds — this surfaces it without re-compiling.
 *
 * Reads synchronously and writes nothing, so it is safe during render and on the server (where there is no
 * storage and the answer is simply null).
 */
import { useMemo } from "react";

import { rememberedCompileSize } from "@/lib/move/compileBrowser";
import type { IncludedArtifacts } from "@/lib/move/compileService";
import { projectToFiles } from "@/lib/move/project";
import type { ProjectContent } from "@/lib/move/project";

export function useRememberedPackageSize(
  project: ProjectContent,
  includedArtifacts: IncludedArtifacts | "",
  overrideSizeCheck: boolean
): number | null {
  return useMemo(() => {
    const files = projectToFiles(project);
    return rememberedCompileSize(files, {
      includedArtifacts: includedArtifacts || undefined,
      overrideSizeCheck,
    });
  }, [project, includedArtifacts, overrideSizeCheck]);
}