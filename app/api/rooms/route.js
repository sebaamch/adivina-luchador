import { NextResponse } from 'next/server';

import {
    createGame,
    getGameByCode
} from '@/lib/supabaseGame';

import {
    makeRoomCode,
    makeToken,
    hashToken
} from '@/lib/game';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const body = await request.json();

        const playerName = String(
            body?.playerName || ''
        ).trim();

        if (!playerName) {
            return NextResponse.json(
                {
                    error: 'El nombre del jugador es obligatorio'
                },
                {
                    status: 400
                }
            );
        }

        let code;
        let existingGame;

        /*
         * Generamos un código hasta encontrar uno
         * que no exista.
         */
        do {
            code = makeRoomCode();

            existingGame = await getGameByCode(code);
        } while (existingGame);

        /*
         * Token privado del jugador.
         *
         * El token completo se entrega solamente
         * al jugador que creó la partida.
         */
        const token = makeToken();

        const tokenHash = hashToken(token);

        const result = await createGame({
            code,
            playerName,
            tokenHash
        });

        return NextResponse.json({
            success: true,

            game: {
                id: result.game.id,
                code: result.game.code,
                status: result.game.status,
                turn_player: result.game.turn_player
            },

            player: {
                id: result.player.id,
                player_no: result.player.player_no,
                name: result.player.name,
                token
            }
        });

    } catch (error) {

        console.error(
            'Error creando partida:',
            error
        );

        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Error creando partida'
            },
            {
                status: 500
            }
        );
    }
}