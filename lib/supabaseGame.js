import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function getGameByCode(code) {
    const cleanCode = String(code)
        .trim()
        .toUpperCase();

    const { data, error } = await supabaseAdmin
        .from('games')
        .select(`
            id,
            code,
            status,
            turn_player,
            winner_player,
            created_at,
            players (
                id,
                game_id,
                player_no,
                name,
                secret_wrestler_id,
                token_hash,
                created_at
            )
        `)
        .eq('code', cleanCode)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}
export async function createGame({
    code,
    playerName,
    tokenHash
}) {
    const { data: game, error: gameError } =
        await supabaseAdmin
            .from('games')
            .insert({
                code,
                status: 'waiting',
                turn_player: 1,
                winner_player: null
            })
            .select()
            .single();

    if (gameError) {
        throw gameError;
    }

    const { data: player, error: playerError } =
        await supabaseAdmin
            .from('players')
            .insert({
                game_id: game.id,
                player_no: 1,
                name: playerName,
                token_hash: tokenHash,
                secret_wrestler_id: null
            })
            .select()
            .single();

    if (playerError) {
        // Si falla el jugador, eliminamos la partida
        await supabaseAdmin
            .from('games')
            .delete()
            .eq('id', game.id);

        throw playerError;
    }

    return {
        game,
        player
    };
}
export async function addPlayerToGame({
    gameId,
    playerName,
    tokenHash
}) {
    const { data: existingPlayers, error: existingError } =
        await supabaseAdmin
            .from('players')
            .select('player_no')
            .eq('game_id', gameId);

    if (existingError) {
        throw existingError;
    }

    if (existingPlayers.some((p) => p.player_no === 2)) {
        throw new Error('La partida ya tiene dos jugadores');
    }

    const { data, error } =
        await supabaseAdmin
            .from('players')
            .insert({
                game_id: gameId,
                player_no: 2,
                name: playerName,
                token_hash: tokenHash,
                secret_wrestler_id: null
            })
            .select()
            .single();

    if (error) {
        throw error;
    }

    return data;
}