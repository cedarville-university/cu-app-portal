import { hasScanResults, reviewResults, type DependencyReview, type ReviewResults } from "./results";

type PilotReview = { checkedAt: Date; repositoryUrl: string; results: unknown };
type NightlyReview = { successfulSha: string | null; source: unknown };
export type SavedSecurityReview = { checkedAt: Date; results: ReviewResults };

export function withDependencyReview(review: SavedSecurityReview | null, dependency: DependencyReview | null) {
  if (!dependency) return review;
  return {
    checkedAt: new Date(Math.max(review?.checkedAt.getTime() ?? 0, Date.parse(dependency.checkedAt))),
    results: { ...(review?.results ?? { revision: null, source: null, checks: [] }), dependency },
  };
}

export function ownerSecurityReview(repository: string | null, pilot: PilotReview | null, nightly: NightlyReview | null) {
  if (!repository) return null;
  const parsed = pilot?.repositoryUrl === repository ? reviewResults.safeParse(pilot.results) : null;
  const results = parsed?.success ? parsed.data : { revision: null, source: null, dependency: null, checks: [] };
  let checkedAt = parsed?.success && pilot ? pilot.checkedAt : new Date(0);
  const source = reviewResults.shape.source.unwrap().safeParse(nightly?.source);
  if (source.success && nightly?.successfulSha && source.data.mainRevision === nightly.successfulSha &&
      (!results.source || nightly.successfulSha !== results.revision || Date.parse(source.data.checkedAt) > Date.parse(results.source.checkedAt))) {
    if (results.source?.findings.length && results.revision && results.revision !== nightly.successfulSha) {
      results.deployedSource = results.source;
    }
    results.source = { ...source.data, mainRevision: nightly.successfulSha };
    checkedAt = new Date(Math.max(checkedAt.getTime(), Date.parse(source.data.checkedAt)));
  }
  return hasScanResults(results) ? { checkedAt, results } : null;
}
