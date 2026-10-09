import { NextResponse } from 'next/server';

import {
    getGameByCode,
    addPlayerToGame
} from '@/lib/supabaseGame';

import {
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

        const code = String(
            body?.code || ''
        ).trim().toUpperCase();

        if (!playerName) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'El nombre del jugador es obligatorio'
                },
                { status: 400 }
            );
        }

        if (!code) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'El código de la partida es obligatorio'
                },
                { status: 400 }
            );
        }

        // Buscar la partida
        const game = await getGameByCode(code);

        if (!game) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'No existe una partida con ese código'
                },
                { status: 404 }
            );
        }

        // La partida debe estar esperando al segundo jugador
        if (game.status !== 'waiting') {
            return NextResponse.json(
                {
                    success: false,
                    error: 'La partida ya comenzó o no está disponible'
                },
                { status: 409 }
            );
        }

        // Verificar que todavía exista espacio
        const player1 = game.players?.find(
            (player) => player.player_no === 1
        );

        const player2 = game.players?.find(
            (player) => player.player_no === 2
        );

        if (!player1) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'La partida no tiene un jugador creador válido'
                },
                { status: 409 }
            );
        }

        if (player2) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'La partida ya tiene dos jugadores'
                },
                { status: 409 }
            );
        }

        // Crear token privado para el jugador 2
        const token = makeToken();
        const tokenHash = hashToken(token);

        const player = await addPlayerToGame({
            gameId: game.id,
            playerName,
            tokenHash
        });

        return NextResponse.json({
            success: true,

            game: {
                id: game.id,
                code: game.code,
                status: game.status,
                turn_player: game.turn_player,
                winnerPlayer: game.winner_player,
                player1Wins: game.player1_wins || 0,
                player2Wins: game.player2_wins || 0,
                roundNumber: game.round_number || 1,

            },

            player: {
                id: player.id,
                player_no: player.player_no,
                name: player.name,

                // Este es el token privado del jugador.
                // Nunca enviamos token_hash.
                token
            }
        });

    } catch (error) {
        console.error('Error uniéndose a partida:', error);

        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Error uniéndose a la partida'
            },
            { status: 500 }
        );
    }
}