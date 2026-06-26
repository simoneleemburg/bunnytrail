// Engine dogfood hook. Real work lives in `$lib/hooks` so consumer
// world repos can boot with a one-line `import 'bunnytrail/hooks';`.
import '$lib/hooks';
export { init } from '$lib/hooks';
