// Smoke test for the bundled sample world. Runs the engine's loader
// against ./sample-world and prints a summary of what the graph sees.
// Used during engine development to verify changes to the loader
// don't break the bundled fixture.
import { graph } from '$lib/server/graph';
import { guides } from '$lib/server/guides';

await graph.ready();
await guides.ready();

const entities = graph.all();
console.log(`entities: ${entities.length}`);
for (const e of entities) {
	console.log(`  - ${e.id}  (${e.meta.name}, kind: ${e.meta.kind ?? '—'})`);
}
console.log(`clusters: ${JSON.stringify(graph.clusters())}`);
console.log(`union shelves: ${JSON.stringify(graph.unionShelves())}`);
console.log(`kinds registered: ${graph.kindIds().length}`);
console.log(`guides: ${guides.all().length}`);
console.log(`issues: ${graph.issues().length}`);
for (const i of graph.issues()) {
	console.log(`  - [${i.kind}] ${i.entity ?? ''} — ${i.detail}`);
}
