// Reference filter, pure: which groups show for a chip, how many projects that is, and what to announce.
// A group is { key, label, count }; count is projects, not cards (one card may hold two projects).

export const ALL = 'hepsi';

export function filterGroups(groups, key) {
  const known = key === ALL || groups.some((g) => g.key === key);
  const active = known ? key : ALL;
  const visible = groups.filter((g) => active === ALL || g.key === active).map((g) => g.key);
  const count = groups
    .filter((g) => visible.includes(g.key))
    .reduce((sum, g) => sum + (Number.isFinite(g.count) && g.count > 0 ? g.count : 0), 0);
  return { active, visible, count };
}

export function statusText(groups, state) {
  if (state.active === ALL) return `${state.count} projenin hepsi gösteriliyor.`;
  const group = groups.find((g) => g.key === state.active);
  return `${group ? group.label : ''}: ${state.count} proje gösteriliyor.`;
}
