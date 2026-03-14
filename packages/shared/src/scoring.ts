/**
 * Compute an impact score for a node based on its dependent count
 * and betweenness centrality. Used to scale node sizes in the UI.
 */
export function computeImpactScore(dependentCount: number, betweennessCentrality: number): number {
  return dependentCount * 0.6 + betweennessCentrality * 0.4;
}
