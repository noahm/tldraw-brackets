import { z } from 'zod'
import {
	btpTourneyRows,
	playerRoundRow,
	roundAdvancementRow,
	roundPoolRow,
	roundRow,
	tourneyRow,
	type BtpTourneyRows,
} from './rows'

export interface BtpConnection {
	/** e.g. https://<project>.supabase.co */
	supabaseUrl: string
	/** the public anon key Blame the Pads' own frontend ships with */
	anonKey: string
}

// These mirror the queries Blame the Pads' own spectator pages make, so they're known to work
// with its row-level security for signed-out readers. Plain PostgREST over fetch keeps
// supabase-js (and its realtime client) out of the worker bundle.
//
// Read-only by construction: this module only ever issues GETs.

export async function fetchTourneyRows(
	conn: BtpConnection,
	tourneyId: number
): Promise<BtpTourneyRows> {
	const get = <T extends z.ZodType>(table: string, query: string, schema: T) =>
		getRows(conn, table, query, schema)

	const [tourneys, pools, rounds, playerRounds] = await Promise.all([
		get('tourneys', `select=id,name,type,status&id=eq.${tourneyId}`, tourneyRow),
		get('round_pools', `select=id,name,sort_order&tourney_id=eq.${tourneyId}`, roundPoolRow),
		get('rounds', `select=id,name,status,round_pool_id&tourney_id=eq.${tourneyId}`, roundRow),
		get(
			'player_rounds',
			'select=id,round_id,player_tourney_id,sort_order,' +
				'player_tourneys!inner(player_name,seed,player_img,tourney_id)' +
				`&player_tourneys.tourney_id=eq.${tourneyId}`,
			playerRoundRow
		),
	])

	const tourney = tourneys[0]
	if (!tourney) throw new Error(`Blame the Pads tourney #${tourneyId} not found`)

	// round_advancements has no tourney_id, and two foreign keys into rounds, so filter by the
	// tourney's round ids rather than embedding through rounds.
	const advancements = rounds.length
		? await get(
				'round_advancements',
				'select=id,round_id,rank_start,rank_end,destination_round_id,label' +
					`&round_id=in.(${rounds.map((r) => r.id).join(',')})`,
				roundAdvancementRow
			)
		: []

	return btpTourneyRows.parse({ tourney, pools, rounds, advancements, playerRounds })
}

async function getRows<T extends z.ZodType>(
	conn: BtpConnection,
	table: string,
	query: string,
	schema: T
): Promise<z.infer<T>[]> {
	const url = `${conn.supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}?${query}`
	const response = await fetch(url, {
		headers: {
			apikey: conn.anonKey,
			authorization: `Bearer ${conn.anonKey}`,
			accept: 'application/json',
		},
	})
	if (!response.ok) {
		const body = await response.text().catch(() => '')
		throw new Error(
			`Blame the Pads ${table} query failed: ${response.status} ${body.slice(0, 200)}`
		)
	}
	const parsed = z.array(schema).safeParse(await response.json())
	if (!parsed.success) {
		throw new Error(
			`Blame the Pads ${table} rows didn't match the expected schema: ${parsed.error.message}`
		)
	}
	return parsed.data
}
