/**
 * AI key from WordPress Connectors (Settings → Connectors), read through WP-CLI.
 *
 * WordPress decides where the key comes from, in its own order: environment variable,
 * PHP constant (e.g. OPENAI_API_KEY), then the key saved on the Connectors screen.
 * The sync uses exactly that key and nothing else.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Connectors the sync can talk to, in order of preference. */
const SUPPORTED_PROVIDERS = ['anthropic', 'openai'];

const DEFAULT_MODELS = {
	anthropic: 'claude-opus-5-5',
	openai: 'gpt-5.5',
};

const MARK = '__RV_CONNECTORS__';

/**
 * Same order as WordPress (wp-includes/connectors.php): env var, constant, database option.
 * Optional settings RV_AI_PROVIDER / RV_OPENAI_MODEL / RV_ANTHROPIC_MODEL come back too when defined.
 */
const PHP = `
if ( ! function_exists( 'wp_get_connectors' ) ) {
	echo '${MARK}' . wp_json_encode( array( 'error' => 'no-connectors', 'version' => get_bloginfo( 'version' ) ) ) . '${MARK}';
	return;
}
$out = array(
	'supportsAi' => function_exists( 'wp_supports_ai' ) ? wp_supports_ai() : true,
	'adminUrl'   => admin_url( 'options-connectors.php' ),
	'keys'       => array(),
	'sources'    => array(),
	'names'      => array(),
	'settings'   => array(),
);
foreach ( wp_get_connectors() as $id => $connector ) {
	if ( 'ai_provider' !== ( $connector['type'] ?? '' ) ) {
		continue;
	}
	$out['names'][ $id ] = $connector['name'] ?? $id;
	$auth = $connector['authentication'] ?? array();
	if ( 'api_key' !== ( $auth['method'] ?? '' ) || empty( $auth['setting_name'] ) ) {
		continue;
	}
	$key    = '';
	$source = '';
	$env    = $auth['env_var_name'] ?? '';
	$const  = $auth['constant_name'] ?? '';
	if ( '' !== $env && is_string( getenv( $env ) ) && '' !== getenv( $env ) ) {
		$key    = getenv( $env );
		$source = 'environment variable ' . $env;
	} elseif ( '' !== $const && defined( $const ) && is_string( constant( $const ) ) && '' !== constant( $const ) ) {
		$key    = constant( $const );
		$source = 'constant ' . $const;
	} else {
		$saved = get_option( $auth['setting_name'], '' );
		if ( is_string( $saved ) && '' !== $saved ) {
			$key    = $saved;
			$source = 'Connectors screen';
		}
	}
	if ( '' !== $key ) {
		$out['keys'][ $id ]    = $key;
		$out['sources'][ $id ] = $source;
	}
}
foreach ( array( 'RV_AI_PROVIDER', 'RV_OPENAI_MODEL', 'RV_ANTHROPIC_MODEL' ) as $name ) {
	if ( defined( $name ) ) {
		$out['settings'][ $name ] = constant( $name );
	}
}
echo '${MARK}' . wp_json_encode( $out ) . '${MARK}';
`;

/**
 * WP-CLI command: RV_WP_CLI (e.g. "wp --path=/var/www"), else "lando wp" in a Lando project, else "wp".
 *
 * @returns {string[]}
 */
function wpCliCommand() {
	const custom = process.env.RV_WP_CLI?.trim();
	if (custom) {
		return custom.split(/\s+/);
	}
	return existsSync(path.join(REPO_ROOT, '.lando.yml')) ? ['lando', 'wp'] : ['wp'];
}

/**
 * Run a WP-CLI command (same runner as the Connectors lookup).
 *
 * @param {string[]} wpArgs e.g. ['create-preview', '--rewrite']
 * @returns {{ ok: boolean, output: string }}
 */
export function runWpCli(wpArgs) {
	const [bin, ...pre] = wpCliCommand();
	try {
		const output = execFileSync(bin, [...pre, ...wpArgs], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 120000,
		});
		return { ok: true, output: output.trim() };
	} catch (error) {
		const output = String(error?.stderr || error?.stdout || error?.message || '').trim();
		return { ok: false, output };
	}
}

/**
 * Ask WordPress for the Connectors AI keys. Never logs the keys.
 */
function readConnectors() {
	const [bin, ...pre] = wpCliCommand();
	const command = [bin, ...pre].join(' ');
	let stdout = '';
	try {
		stdout = execFileSync(bin, [...pre, 'eval', PHP], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 120000,
			maxBuffer: 10 * 1024 * 1024,
		});
	} catch (error) {
		stdout = String(error?.stdout ?? '');
		if (!stdout.includes(MARK)) {
			// error.message contains the whole PHP snippet, so show stderr or the exit reason only.
			const detail =
				error?.code === 'ENOENT'
					? `"${bin}" was not found.`
					: String(error?.stderr ?? '').trim().split('\n').slice(-3).join(' ') || `Exit code ${error?.status ?? '?'}.`;
			throw new Error(
				`Could not read the AI key from WordPress Connectors with "${command}".\n` +
					'  The sync needs the local WordPress site running (for Lando: lando start).\n' +
					`  Set RV_WP_CLI if WP-CLI runs another way (e.g. RV_WP_CLI="wp --path=/path/to/wp").\n  ${detail}`,
			);
		}
	}
	const parts = stdout.split(MARK);
	if (parts.length < 3) {
		throw new Error(`WordPress did not answer as expected ("${command} eval").`);
	}
	return JSON.parse(parts[1]);
}

/**
 * @param {{ providerFlag?: string, modelFlag?: string }} [flags]
 * @returns {{ provider: 'anthropic' | 'openai', apiKey: string, model: string, source: string, providerName: string }}
 */
export function readAiConfig(flags = {}) {
	const wp = readConnectors();

	if (wp.error === 'no-connectors') {
		throw new Error(
			`This site runs WordPress ${wp.version}. Figma Sync needs WordPress Connectors (WordPress 7.0 or newer).`,
		);
	}
	if (wp.supportsAi === false) {
		throw new Error('AI is turned off on this WordPress site (WP_AI_SUPPORT or the wp_supports_ai filter).');
	}

	const setting = (name) => process.env[name]?.trim() || String(wp.settings?.[name] ?? '').trim();
	const keys = wp.keys ?? {};
	const usable = SUPPORTED_PROVIDERS.filter((id) => keys[id]);

	if (!usable.length) {
		const other = Object.keys(keys).map((id) => wp.names?.[id] ?? id);
		throw new Error(
			'No AI connector is set up in WordPress.\n' +
				`  Open ${wp.adminUrl} and add an Anthropic or OpenAI API key.` +
				(other.length ? `\n  (${other.join(', ')} is set up, but Figma Sync works only with Anthropic or OpenAI.)` : ''),
		);
	}

	let provider = (flags.providerFlag || setting('RV_AI_PROVIDER')).toLowerCase();
	if (provider === 'claude') {
		provider = 'anthropic';
	}
	if (provider && !SUPPORTED_PROVIDERS.includes(provider)) {
		throw new Error('The AI provider must be anthropic or openai.');
	}
	if (provider && !keys[provider]) {
		throw new Error(`The ${provider} connector has no API key. Add it at ${wp.adminUrl}, or choose another provider.`);
	}
	provider = provider || usable[0];

	const model =
		flags.modelFlag ||
		(provider === 'anthropic' ? setting('RV_ANTHROPIC_MODEL') : setting('RV_OPENAI_MODEL')) ||
		DEFAULT_MODELS[provider];

	return {
		provider,
		apiKey: keys[provider],
		model,
		source: wp.sources?.[provider] ?? 'Connectors',
		providerName: wp.names?.[provider] ?? provider,
	};
}
