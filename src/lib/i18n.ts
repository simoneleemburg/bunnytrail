/**
 * Built-in UI strings for the bunnytrail engine.
 *
 * Worlds opt into a language via `language: <code>` in
 * `content_meta/world.md`. English is the default.
 *
 * To add a language: add its code to `Locale`, then add a complete
 * entry to `TRANSLATIONS` (TypeScript will tell you what keys are missing).
 *
 * These strings cover engine chrome only — nav labels, section headings,
 * empty states, aria-labels, etc. World-authored text (entity names,
 * guide titles, body prose) is always rendered verbatim.
 */

export type Locale = 'en' | 'nl';

export interface Translations {
	// ── Layout / nav ──────────────────────────────────────────────────
	nav_meta_eyebrow: string;
	nav_kinds: string;
	nav_guides: string;
	nav_journal: string;
	nav_symbology: string;
	nav_graph: string;
	nav_relations: string;
	nav_search_aria: string;
	nav_menu_open_aria: string;
	nav_menu_close_aria: string;
	nav_filters_label: string;
	nav_cluster_eyebrow: string;
	nav_era_eyebrow: string;
	nav_all_eras: string;
	nav_devmode_enable: string;
	nav_devmode_disable: string;
	nav_health_issues: (n: number) => string;
	nav_copypath_aria: string;
	nav_copykind_aria: string;
	nav_copyclass_aria: string;
	nav_viewhealth_aria: string;
	nav_devbar_stub: string;
	nav_devbar_issues: (n: number) => string;
	nav_logout: string;

	// ── Home page ──────────────────────────────────────────────────────
	home_entities: string;
	home_with_prose: string;
	home_stubs: string;
	home_words: string;
	home_issues: (n: number) => string;
	home_gate_section_aria: string;
	home_gate_boxes_aria: string;
	home_gate_char_aria: (i: number, total: number) => string;
	home_gate_wrong: string;
	home_sources_eyebrow: string;
	home_sources_title: string;
	home_sources_feeder: (n: number) => string;
	home_sources_more: (n: number) => string;
	home_notebook_eyebrow: string;
	home_notebook_title: string;
	home_notebook_sub: (worldName: string) => string;
	home_influences_label: string;
	home_influences_cta: string;
	home_collections_heading: string;
	home_threads_heading: string;
	home_tags_heading: string;

	// ── Entity page ────────────────────────────────────────────────────
	entity_also_known_as: string;
	entity_sections_aria: string;
	entity_tab_about: string;
	entity_tab_instances: string;
	entity_tab_holders: string;
	entity_tab_statistics: string;
	entity_tab_vocabulary: string;
	entity_rank_nav_aria: string;
	entity_rank_prev_aria: (name: string) => string;
	entity_rank_prev_label: string;
	entity_rank_next_aria: (name: string) => string;
	entity_rank_next_label: string;
	entity_chapters_fallback: string;
	entity_children_aria: string;
	entity_craft_aria: string;
	entity_craft_link: string;
	entity_graph_link: string;
	entity_show_fewer: string;
	entity_show_all: (n: number) => string;

	// ── Collection page ────────────────────────────────────────────────
	collection_nav_aria: string;
	collection_nav_prev_aria: (title: string) => string;
	collection_nav_prev_label: string;
	collection_nav_next_aria: (title: string) => string;
	collection_nav_next_label: string;
	collection_empty: (plural: string) => string;
	collection_entries: (n: number) => string;
	collection_viewmode_aria: string;
	collection_view_index: string;
	collection_view_tree: string;
	collection_view_flat: string;
	collection_view_orbits: string;
	collection_subcollections_aria: string;
	collection_eyebrow_cluster: string;
	collection_eyebrow_collection: string;
	collection_subshelves_aria: string;
	collection_see_entity: string;
	collection_containers_aria: string;
	collection_subtrees_aria: string;
	collection_orbits_aria: string;
	collection_filters_aria: string;
	collection_filter_kind_aria: string;
	collection_filter_kind_label: string;
	collection_filter_all: string;
	collection_filter_folder_aria: string;
	collection_filter_folder_label: string;
	collection_filter_tag_aria: string;
	collection_filter_tag_label: string;
	collection_filter_more: (n: number) => string;
	collection_filter_fewer: string;
	collection_filter_clear: string;
	collection_view_all: (label: string) => string;
	collection_focus_on: (label: string) => string;

	// ── Kinds ──────────────────────────────────────────────────────────
	kinds_title: string;
	kinds_empty: string;
	kinds_unregistered: string;
	kind_up_aria: string;
	kind_up_label: string;
	kind_mentioned_in: string;
	kind_sections_aria: string;
	kind_tab_about: string;
	kind_tab_instances: string;
	kind_class_label: string;

	// ── Relations ─────────────────────────────────────────────────────
	relations_title: string;
	relations_lede: string;
	relations_no_schema: string;
	relations_empty: string;
	relations_undefined_heading: string;
	relations_undefined_blurb: string;
	relations_properties_heading: string;
	relations_properties_blurb: string;
	relations_no_properties: string;
	relations_edges: (n: number) => string;
	relations_entities: (n: number) => string;

	// ── Relation detail ────────────────────────────────────────────────
	relation_breadcrumb: string;
	relation_inverse: (label: string) => string;
	relation_schema_kind: string;
	relation_schema_domain: string;
	relation_schema_codomain: string;
	relation_any: string;
	relation_empty: string;
	relation_edges_heading: string;
	relation_missing_heading: string;
	relation_missing_blurb: (label: string) => string;

	// ── Properties ────────────────────────────────────────────────────
	properties_title: string;
	properties_lede: string;
	properties_no_schema: string;
	properties_empty: string;
	properties_entities: (n: number) => string;

	// ── Property detail ───────────────────────────────────────────────
	property_breadcrumb: string;
	property_schema_id: string;
	property_schema_kind: string;
	property_schema_values: string;
	property_empty: string;
	property_entities_heading: string;

	// ── Health ────────────────────────────────────────────────────────
	health_title: string;
	health_lede: string;
	health_lede_good: string;
	health_empty: string;

	// ── Graph ─────────────────────────────────────────────────────────
	graph_aria: string;
	graph_ego_back: string;
	graph_ego_open: string;
	graph_filter_aria: string;
	graph_filter_heading: string;
	graph_filter_clear: string;
	graph_collapse_aria: string;
	graph_expand_aria: string;

	// ── Symbology ─────────────────────────────────────────────────────
	symbology_title: string;
	symbology_empty: string;

	// ── Guides ────────────────────────────────────────────────────────
	guides_eyebrow: string;
	guides_empty: string;

	// ── Blog / Journal ────────────────────────────────────────────────
	blog_nav_aria: string;
	blog_title: string;
	blog_sub: (worldName: string) => string;
	blog_empty: string;
	blog_post_nav_aria: string;
	blog_post_back: string;
	blog_post_eyebrow: string;

	// ── Influences ────────────────────────────────────────────────────
	influences_nav_aria: string;
	influences_title: string;
	influences_sub: string;
	influences_filter_aria: string;
	influences_filter_all: string;
	influences_empty: string;
	influences_empty_filtered: string;
	influence_nav_aria: string;
	influence_back: string;
	influence_empty: string;

	// ── Sources ───────────────────────────────────────────────────────
	sources_eyebrow: string;
	sources_title: string;
	sources_sub: (worldName: string) => string;
	sources_empty: string;
	sources_entity_in: (worldName: string) => string;
	sources_integration_title: (pct: number, worldName: string) => string;
	sources_integration_aria: (pct: number) => string;

	// ── Tags ──────────────────────────────────────────────────────────
	tags_entries: (n: number) => string;

	// ── Craft page ────────────────────────────────────────────────────
	craft_nav_aria: string;
	craft_title: string;
	craft_companion: string;

	// ── Chapter page ──────────────────────────────────────────────────
	chapter_nav_aria: (unit: string) => string;
	chapter_eyebrow: (unit: string, order: string) => string;
	chapter_prev: string;
	chapter_contents: string;
	chapter_next: string;
	chapter_unit_default: string;
}

const en: Translations = {
	// Layout / nav
	nav_meta_eyebrow: 'Meta',
	nav_kinds: 'Kinds',
	nav_guides: 'Guides',
	nav_journal: 'Journal',
	nav_symbology: 'Symbology',
	nav_graph: 'Graph',
	nav_relations: 'Relations',
	nav_search_aria: 'Search',
	nav_menu_open_aria: 'Open menu',
	nav_menu_close_aria: 'Close menu',
	nav_filters_label: 'Filters',
	nav_cluster_eyebrow: 'Cluster',
	nav_era_eyebrow: 'Era',
	nav_all_eras: 'All eras',
	nav_devmode_enable: 'Enable dev mode',
	nav_devmode_disable: 'Disable dev mode',
	nav_health_issues: (n) => `${n} health issue${n === 1 ? '' : 's'}`,
	nav_copypath_aria: 'Copy path',
	nav_copykind_aria: 'Copy kind',
	nav_copyclass_aria: 'Copy class',
	nav_viewhealth_aria: 'View all health issues',
	nav_devbar_stub: 'stub',
	nav_devbar_issues: (n) => `${n} issue${n === 1 ? '' : 's'}`,
	nav_logout: 'Log out',

	// Home
	home_entities: 'entities',
	home_with_prose: 'with prose',
	home_stubs: 'stubs',
	home_words: 'words',
	home_issues: (n) => `${n} ${n === 1 ? 'issue' : 'issues'}`,
	home_gate_section_aria: 'Secret passphrase entry',
	home_gate_boxes_aria: 'Secret passphrase',
	home_gate_char_aria: (i, total) => `Character ${i} of ${total}`,
	home_gate_wrong: "That's not it.",
	home_sources_eyebrow: 'Workbench',
	home_sources_title: 'Source projects',
	home_sources_feeder: (n) => `${n} feeder work${n === 1 ? '' : 's'}:`,
	home_sources_more: (n) => `and ${n} more`,
	home_notebook_eyebrow: 'Working notes',
	home_notebook_title: 'Notebook',
	home_notebook_sub: (w) => `Author's-room reflections on building ${w}. Out-of-world; not part of the compendium.`,
	home_influences_label: 'My influences',
	home_influences_cta: 'Browse influences →',
	home_collections_heading: 'Collections',
	home_threads_heading: 'Starting threads',
	home_tags_heading: 'Tags',

	// Entity
	entity_also_known_as: 'Also known as:',
	entity_sections_aria: 'Entity sections',
	entity_tab_about: 'About',
	entity_tab_instances: 'Instances',
	entity_tab_holders: 'Holders',
	entity_tab_statistics: 'Statistics',
	entity_tab_vocabulary: 'Vocabulary',
	entity_rank_nav_aria: 'Ranked navigation',
	entity_rank_prev_aria: (name) => `Previous: ${name}`,
	entity_rank_prev_label: 'back',
	entity_rank_next_aria: (name) => `Next: ${name}`,
	entity_rank_next_label: 'next',
	entity_chapters_fallback: 'Chapters',
	entity_children_aria: 'Contents',
	entity_craft_aria: "Author's notes",
	entity_craft_link: 'Craft sheet →',
	entity_graph_link: 'Graph →',
	entity_show_fewer: 'Show fewer',
	entity_show_all: (n) => `Show all (${n})`,

	// Collection
	collection_nav_aria: 'Collection navigation',
	collection_nav_prev_aria: (t) => `Previous: ${t}`,
	collection_nav_prev_label: 'back',
	collection_nav_next_aria: (t) => `Next: ${t}`,
	collection_nav_next_label: 'next',
	collection_empty: (plural) => `No ${plural.toLowerCase()} have been recorded yet.`,
	collection_entries: (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`,
	collection_viewmode_aria: 'View mode',
	collection_view_index: 'Index',
	collection_view_tree: 'Tree',
	collection_view_flat: 'Flat',
	collection_view_orbits: 'Orbits',
	collection_subcollections_aria: 'Subcollections',
	collection_eyebrow_cluster: 'Cluster',
	collection_eyebrow_collection: 'Collection',
	collection_subshelves_aria: 'Sub-shelves',
	collection_see_entity: 'see entity →',
	collection_containers_aria: 'Container entities',
	collection_subtrees_aria: 'Subcollection trees',
	collection_orbits_aria: 'Orbital hierarchy',
	collection_filters_aria: 'Filters',
	collection_filter_kind_aria: 'Filter by kind',
	collection_filter_kind_label: 'Kind',
	collection_filter_all: 'All',
	collection_filter_folder_aria: 'Filter by folder',
	collection_filter_folder_label: 'Folder',
	collection_filter_tag_aria: 'Filter by tag',
	collection_filter_tag_label: 'Tags',
	collection_filter_more: (n) => `+${n} more`,
	collection_filter_fewer: 'show fewer',
	collection_filter_clear: 'clear',
	collection_view_all: (label) => `← View all ${label}`,
	collection_focus_on: (label) => `Focus on ${label} →`,

	// Kinds
	kinds_title: 'Kinds',
	kinds_empty: 'No kinds have been registered yet.',
	kinds_unregistered: 'Unregistered',
	kind_up_aria: 'Up to Kinds',
	kind_up_label: 'Kinds',
	kind_mentioned_in: 'Mentioned in',
	kind_sections_aria: 'Kind sections',
	kind_tab_about: 'About',
	kind_tab_instances: 'Instances',
	kind_class_label: 'Class',

	// Relations
	relations_title: 'Relations',
	relations_lede: 'Relation types defined in the world schema. Click a kind to see all its edges.',
	relations_no_schema: 'No relations schema defined in world.md.',
	relations_empty: 'No relation kinds defined yet.',
	relations_undefined_heading: 'Undefined kinds',
	relations_undefined_blurb: 'Used in content but not in world schema.',
	relations_properties_heading: 'Properties',
	relations_properties_blurb: 'Property types defined in the world schema.',
	relations_no_properties: 'No property kinds defined yet.',
	relations_edges: (n) => `${n} edges`,
	relations_entities: (n) => `${n} entities`,

	// Relation detail
	relation_breadcrumb: 'Relations',
	relation_inverse: (label) => `Inverse: ${label}`,
	relation_schema_kind: 'Kind',
	relation_schema_domain: 'Domain',
	relation_schema_codomain: 'Codomain',
	relation_any: 'Any',
	relation_empty: 'No edges of this kind in the graph.',
	relation_edges_heading: 'Edges',
	relation_missing_heading: 'Missing',
	relation_missing_blurb: (label) =>
		`Entities whose kind satisfies the domain constraint but have no ${label.toLowerCase()} relation.`,

	// Properties
	properties_title: 'Properties',
	properties_lede: 'Property types defined in the world schema.',
	properties_no_schema: 'No properties schema defined in world.md.',
	properties_empty: 'No property kinds defined yet.',
	properties_entities: (n) => `${n} entities`,

	// Property detail
	property_breadcrumb: 'Properties',
	property_schema_id: 'Id',
	property_schema_kind: 'Kind',
	property_schema_values: 'Values',
	property_empty: 'No entities carry this property.',
	property_entities_heading: 'Entities',

	// Health
	health_title: 'Health',
	health_lede: 'Everything the loader flagged on its last pass. Each group below is one category of issue; entities are linked to their page when one exists.',
	health_lede_good: 'Empty is good.',
	health_empty: 'No issues. The compendium is in good order.',

	// Graph
	graph_aria: 'Entity relationship graph',
	graph_ego_back: '← All',
	graph_ego_open: 'Open →',
	graph_filter_aria: 'Filter by kind',
	graph_filter_heading: 'Filter by kind',
	graph_filter_clear: 'Clear',
	graph_collapse_aria: 'Collapse',
	graph_expand_aria: 'Expand',

	// Symbology
	symbology_title: 'Symbology',
	symbology_empty: 'No entities with a sigil glyph have been recorded yet.',

	// Guides
	guides_eyebrow: 'Start here',
	guides_empty: 'No guides yet.',

	// Blog
	blog_nav_aria: 'Journal navigation',
	blog_title: 'Journal',
	blog_sub: (w) => `My reflections on building ${w}.`,
	blog_empty: 'No entries yet.',
	blog_post_nav_aria: 'Journal navigation',
	blog_post_back: '↩ All entries',
	blog_post_eyebrow: 'Journal',

	// Influences
	influences_nav_aria: 'Influences navigation',
	influences_title: 'Influences',
	influences_sub: 'Works, ideas, and creators that shaped this world.',
	influences_filter_aria: 'Filter by kind',
	influences_filter_all: 'All',
	influences_empty: 'No influences recorded yet.',
	influences_empty_filtered: 'No influences in this category.',
	influence_nav_aria: 'Influences navigation',
	influence_back: '← Influences',
	influence_empty: 'No further details recorded.',

	// Sources
	sources_eyebrow: 'Workbench',
	sources_title: 'Source projects',
	sources_sub: (w) => `The feeder works being absorbed into ${w}. Out-of-world; ordered newest first.`,
	sources_empty: 'No source projects yet.',
	sources_entity_in: (w) => `In ${w}:`,
	sources_integration_title: (pct, w) => `${pct}% integrated into ${w}`,
	sources_integration_aria: (pct) => `${pct}% integrated`,

	// Tags
	tags_entries: (n) => `${n} ${n === 1 ? 'entry' : 'entries'} tagged`,

	// Craft
	craft_nav_aria: 'Subject navigation',
	craft_title: 'Craft sheet',
	craft_companion: 'Companion notes for',

	// Chapter
	chapter_nav_aria: (unit) => `${unit} navigation`,
	chapter_eyebrow: (unit, order) => `${unit} ${order}`,
	chapter_prev: 'Previous',
	chapter_contents: 'Contents',
	chapter_next: 'Next',
	chapter_unit_default: 'Chapter',
};

const nl: Translations = {
	// Layout / nav
	nav_meta_eyebrow: 'Meta',
	nav_kinds: 'Soorten',
	nav_guides: 'Gidsen',
	nav_journal: 'Dagboek',
	nav_symbology: 'Symbologie',
	nav_graph: 'Graaf',
	nav_relations: 'Relaties',
	nav_search_aria: 'Zoeken',
	nav_menu_open_aria: 'Menu openen',
	nav_menu_close_aria: 'Menu sluiten',
	nav_filters_label: 'Filters',
	nav_cluster_eyebrow: 'Cluster',
	nav_era_eyebrow: 'Tijdperk',
	nav_all_eras: 'Alle tijdperken',
	nav_devmode_enable: 'Ontwikkelaarsmodus inschakelen',
	nav_devmode_disable: 'Ontwikkelaarsmodus uitschakelen',
	nav_health_issues: (n) => `${n} ${n === 1 ? 'melding' : 'meldingen'}`,
	nav_copypath_aria: 'Pad kopiëren',
	nav_copykind_aria: 'Soort kopiëren',
	nav_copyclass_aria: 'Klasse kopiëren',
	nav_viewhealth_aria: 'Alle meldingen bekijken',
	nav_devbar_stub: 'stub',
	nav_devbar_issues: (n) => `${n} ${n === 1 ? 'melding' : 'meldingen'}`,
	nav_logout: 'Uitloggen',

	// Home
	home_entities: 'entiteiten',
	home_with_prose: 'met tekst',
	home_stubs: 'stubs',
	home_words: 'woorden',
	home_issues: (n) => `${n} ${n === 1 ? 'melding' : 'meldingen'}`,
	home_gate_section_aria: 'Wachtwoord invoeren',
	home_gate_boxes_aria: 'Geheim wachtwoord',
	home_gate_char_aria: (i, total) => `Teken ${i} van ${total}`,
	home_gate_wrong: 'Dat klopt niet.',
	home_sources_eyebrow: 'Werkplaats',
	home_sources_title: 'Bronprojecten',
	home_sources_feeder: (n) => `${n} bronwerk${n === 1 ? '' : 'en'}:`,
	home_sources_more: (n) => `en ${n} meer`,
	home_notebook_eyebrow: 'Werkaantekeningen',
	home_notebook_title: 'Notitieboek',
	home_notebook_sub: (w) => `Notities over het bouwen van ${w}. Buiten de wereld; geen deel van het compendium.`,
	home_influences_label: 'Mijn invloeden',
	home_influences_cta: 'Bekijk invloeden →',
	home_collections_heading: 'Collecties',
	home_threads_heading: 'Begindraden',
	home_tags_heading: 'Labels',

	// Entity
	entity_also_known_as: 'Ook bekend als:',
	entity_sections_aria: 'Entiteitssecties',
	entity_tab_about: 'Over',
	entity_tab_instances: 'Voorkomens',
	entity_tab_holders: 'Dragers',
	entity_tab_statistics: 'Statistieken',
	entity_tab_vocabulary: 'Woordenlijst',
	entity_rank_nav_aria: 'Rangnavigatie',
	entity_rank_prev_aria: (name) => `Vorige: ${name}`,
	entity_rank_prev_label: 'vorige',
	entity_rank_next_aria: (name) => `Volgende: ${name}`,
	entity_rank_next_label: 'volgende',
	entity_chapters_fallback: 'Hoofdstukken',
	entity_children_aria: 'Inhoud',
	entity_craft_aria: 'Auteursnotities',
	entity_craft_link: 'Ontwerpblad →',
	entity_graph_link: 'Graaf →',
	entity_show_fewer: 'Minder tonen',
	entity_show_all: (n) => `Alles tonen (${n})`,

	// Collection
	collection_nav_aria: 'Collectienavigatie',
	collection_nav_prev_aria: (t) => `Vorige: ${t}`,
	collection_nav_prev_label: 'vorige',
	collection_nav_next_aria: (t) => `Volgende: ${t}`,
	collection_nav_next_label: 'volgende',
	collection_empty: (plural) => `Er zijn nog geen ${plural.toLowerCase()} vastgelegd.`,
	collection_entries: (n) => `${n} ${n === 1 ? 'vermelding' : 'vermeldingen'}`,
	collection_viewmode_aria: 'Weergavemodus',
	collection_view_index: 'Index',
	collection_view_tree: 'Boom',
	collection_view_flat: 'Vlak',
	collection_view_orbits: 'Banen',
	collection_subcollections_aria: 'Subcollecties',
	collection_eyebrow_cluster: 'Cluster',
	collection_eyebrow_collection: 'Collectie',
	collection_subshelves_aria: 'Subschappen',
	collection_see_entity: 'zie entiteit →',
	collection_containers_aria: 'Containerentiteiten',
	collection_subtrees_aria: 'Subcollectiebomen',
	collection_orbits_aria: 'Orbitale hiërarchie',
	collection_filters_aria: 'Filters',
	collection_filter_kind_aria: 'Filteren op soort',
	collection_filter_kind_label: 'Soort',
	collection_filter_all: 'Alles',
	collection_filter_folder_aria: 'Filteren op map',
	collection_filter_folder_label: 'Map',
	collection_filter_tag_aria: 'Filteren op label',
	collection_filter_tag_label: 'Labels',
	collection_filter_more: (n) => `+${n} meer`,
	collection_filter_fewer: 'minder tonen',
	collection_filter_clear: 'wissen',
	collection_view_all: (label) => `← Alle ${label} tonen`,
	collection_focus_on: (label) => `Focus op ${label} →`,

	// Kinds
	kinds_title: 'Soorten',
	kinds_empty: 'Er zijn nog geen soorten geregistreerd.',
	kinds_unregistered: 'Niet geregistreerd',
	kind_up_aria: 'Terug naar Soorten',
	kind_up_label: 'Soorten',
	kind_mentioned_in: 'Genoemd in',
	kind_sections_aria: 'Soortsecties',
	kind_tab_about: 'Over',
	kind_tab_instances: 'Voorkomens',
	kind_class_label: 'Klasse',

	// Relations
	relations_title: 'Relaties',
	relations_lede: 'Relatietypen gedefinieerd in het wereldschema. Klik op een soort om alle verbindingen te zien.',
	relations_no_schema: 'Geen relatieschema gedefinieerd in world.md.',
	relations_empty: 'Nog geen relatiesoorten gedefinieerd.',
	relations_undefined_heading: 'Ongedefinieerde soorten',
	relations_undefined_blurb: 'Gebruikt in inhoud maar niet in het wereldschema.',
	relations_properties_heading: 'Eigenschappen',
	relations_properties_blurb: 'Eigenschapstypen gedefinieerd in het wereldschema.',
	relations_no_properties: 'Nog geen eigenschapssoorten gedefinieerd.',
	relations_edges: (n) => `${n} verbindingen`,
	relations_entities: (n) => `${n} entiteiten`,

	// Relation detail
	relation_breadcrumb: 'Relaties',
	relation_inverse: (label) => `Omgekeerd: ${label}`,
	relation_schema_kind: 'Soort',
	relation_schema_domain: 'Domein',
	relation_schema_codomain: 'Codomein',
	relation_any: 'Elk',
	relation_empty: 'Geen verbindingen van dit soort in de graaf.',
	relation_edges_heading: 'Verbindingen',
	relation_missing_heading: 'Ontbrekend',
	relation_missing_blurb: (label) =>
		`Entiteiten waarvan het soort voldoet aan de domeinbeperking maar die geen ${label.toLowerCase()}-relatie hebben.`,

	// Properties
	properties_title: 'Eigenschappen',
	properties_lede: 'Eigenschapstypen gedefinieerd in het wereldschema.',
	properties_no_schema: 'Geen eigenschappenschema gedefinieerd in world.md.',
	properties_empty: 'Nog geen eigenschapssoorten gedefinieerd.',
	properties_entities: (n) => `${n} entiteiten`,

	// Property detail
	property_breadcrumb: 'Eigenschappen',
	property_schema_id: 'Id',
	property_schema_kind: 'Soort',
	property_schema_values: 'Waarden',
	property_empty: 'Geen entiteiten met deze eigenschap.',
	property_entities_heading: 'Entiteiten',

	// Health
	health_title: 'Gezondheid',
	health_lede: 'Alles wat de loader tijdens de laatste doorloop heeft gemarkeerd. Elke groep hieronder is één categorie; entiteiten zijn gelinkt aan hun pagina wanneer die bestaat.',
	health_lede_good: 'Leeg is goed.',
	health_empty: 'Geen meldingen. Het compendium is in orde.',

	// Graph
	graph_aria: 'Entiteitsrelatiegraaf',
	graph_ego_back: '← Alles',
	graph_ego_open: 'Openen →',
	graph_filter_aria: 'Filteren op soort',
	graph_filter_heading: 'Filteren op soort',
	graph_filter_clear: 'Wissen',
	graph_collapse_aria: 'Inklappen',
	graph_expand_aria: 'Uitklappen',

	// Symbology
	symbology_title: 'Symbologie',
	symbology_empty: 'Nog geen entiteiten met een sigilglief vastgelegd.',

	// Guides
	guides_eyebrow: 'Begin hier',
	guides_empty: 'Nog geen gidsen.',

	// Blog
	blog_nav_aria: 'Dagboeknavigatie',
	blog_title: 'Dagboek',
	blog_sub: (w) => `Mijn gedachten over het bouwen van ${w}.`,
	blog_empty: 'Nog geen berichten.',
	blog_post_nav_aria: 'Dagboeknavigatie',
	blog_post_back: '↩ Alle berichten',
	blog_post_eyebrow: 'Dagboek',

	// Influences
	influences_nav_aria: 'Invloedennavigatie',
	influences_title: 'Invloeden',
	influences_sub: 'Werken, ideeën en makers die deze wereld hebben gevormd.',
	influences_filter_aria: 'Filteren op soort',
	influences_filter_all: 'Alles',
	influences_empty: 'Nog geen invloeden vastgelegd.',
	influences_empty_filtered: 'Geen invloeden in deze categorie.',
	influence_nav_aria: 'Invloedennavigatie',
	influence_back: '← Invloeden',
	influence_empty: 'Geen verdere details vastgelegd.',

	// Sources
	sources_eyebrow: 'Werkplaats',
	sources_title: 'Bronprojecten',
	sources_sub: (w) => `De bronwerken die worden opgenomen in ${w}. Buiten de wereld; nieuwste eerst.`,
	sources_empty: 'Nog geen bronprojecten.',
	sources_entity_in: (w) => `In ${w}:`,
	sources_integration_title: (pct, w) => `${pct}% geïntegreerd in ${w}`,
	sources_integration_aria: (pct) => `${pct}% geïntegreerd`,

	// Tags
	tags_entries: (n) => `${n} ${n === 1 ? 'vermelding' : 'vermeldingen'} getagd`,

	// Craft
	craft_nav_aria: 'Onderwerpnavigatie',
	craft_title: 'Ontwerpblad',
	craft_companion: 'Begeleidende notities voor',

	// Chapter
	chapter_nav_aria: (unit) => `${unit}navigatie`,
	chapter_eyebrow: (unit, order) => `${unit} ${order}`,
	chapter_prev: 'Vorige',
	chapter_contents: 'Inhoud',
	chapter_next: 'Volgende',
	chapter_unit_default: 'Hoofdstuk',
};

const LOCALES: Record<Locale, Translations> = { en, nl };

/**
 * Returns the translation for the given key in the given locale,
 * falling back to English if the locale is somehow unrecognised.
 */
export function t(locale: Locale | string | undefined): Translations {
	return LOCALES[(locale as Locale) ?? 'en'] ?? LOCALES.en;
}
