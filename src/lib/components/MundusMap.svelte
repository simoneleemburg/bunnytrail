<script lang="ts">
	/**
	 * The Mundus triangle — the cosmological map.
	 *
	 * Renders a pre-baked SVG produced by scripts/bake-mundus-map.js.
	 * The visual chrome (figure container, hover affordances, label
	 * typography) lives globally under `.alteria-inline-svg` in
	 * `src/lib/styles/global.css`, so the same look applies when an
	 * author embeds a baked SVG inline in prose via
	 * `![alt](assets/...svg)` or a sibling `![alt](map.svg)`.
	 *
	 * The `svg` prop is the raw SVG string, passed down from a server
	 * load function so it can be sourced from the alteria_world assets
	 * directory rather than the bundled src/lib/assets file.
	 */

	interface Props {
		/** Raw SVG markup — the full <svg>…</svg> string. */
		svg: string;
	}

	const { svg }: Props = $props();
</script>

<figure class="alteria-inline-svg">
	{@html svg}

	<figcaption>
		The cosmology as a contained triangular space, held between three related Cardinals. The faint
		topographical rings show how the bounds are approached: bunched tighter and tighter toward the
		edges and corners, because no ordinary thing in Mundus can fully reach any of them.
	</figcaption>
</figure>
