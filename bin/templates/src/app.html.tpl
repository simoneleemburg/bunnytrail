<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="text-scale" content="scale" />
		%sveltekit.head%
		<!-- World-coupled SVG figure chrome. Auto-synthesised from
		     the world's per-map CSS files. -->
		<link rel="stylesheet" href="/api/assets/inline-svg.css" />
		<!-- World theme (palette, fonts, manuscript chrome).
		     Placed AFTER %sveltekit.head% so its declarations
		     cascade after the bundled engine tokens — themes
		     override by value, not by specificity. A world that
		     wants web fonts @imports them at the top of theme.css. -->
		<link rel="stylesheet" href="/api/assets/theme.css" />
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
