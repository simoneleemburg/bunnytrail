import { graph } from '$lib/server/graph';
import { loadKindPage } from './_kindPage.load';

export type {
	KindCard,
	KindSliceNode,
	KindRefSection,
	KindPageData
} from './_kindPage.load';

export async function load({ params }: { params: { kind: string } }) {
	await graph.ready();
	return loadKindPage(params.kind, null);
}
