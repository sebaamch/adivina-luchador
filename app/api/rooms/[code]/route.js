import { NextResponse } from "next/server";

import {
    getGameByCode
} from "@/lib/supabaseGame";

import {
    supabaseAdmin
} from "@/lib/supabaseAdmin";

import {
    compare,
    hashToken,
    publicWrestler
} from "@/lib/game";

export const dynamic = "force-dynamic";

/**
 * Busca al jugador usando el token recibido.
 * El cliente nunca recibe tokenHash.
 */
function findPlayer(game, token) {
    if (!token) return null;

    const tokenHash = hashToken(token);

    return (
        game.players?.find(
            (player) => player.token_hash === tokenHash
        ) || null
    );
}

/**
 * Obtiene un luchador por ID desde Supabase.
 */
async function getWrestler(identifier) {
    if (!identifier) return null;

    const value = String(identifier).trim();

    const isNumericId = /^\d+$/.test(value);

    let query = supabaseAdmin
        .from("wrestlers")
        .select("*");

    if (isNumericId) {
        query = query.eq("id", Number(value));
    } else {
        query = query.eq("slug", value);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

/**
 * Obtiene todos los luchadores necesarios para construir
 * el estado público de la partida.
 */
async function roomForPlayer(game, me) {
    const opponent = game.players?.find(
        (p) => p.player_no !== me.player_no
    );

    const bothSelected =
        game.players?.length === 2 &&
        game.players.every(
            (p) => Boolean(p.secret_wrestler_id)
        );

    const mySecret = me.secret_wrestler_id
        ? publicWrestler(
            await getWrestler(me.secret_wrestler_id)
        )
        : null;

    let opponentSecret = null;

    if (
        game.status === "finished" &&
        opponent?.secret_wrestler_id
    ) {
        opponentSecret = publicWrestler(
            await getWrestler(
                opponent.secret_wrestler_id
            )
        );
    }

    /**
     * Obtener las guesses.
     */
    const { data: guessesData, error: guessesError } =
        await supabaseAdmin
            .from("guesses")
            .select(`
                id,
                game_id,
                player_id,
                wrestler_id,
                created_at
            `)
            .eq("game_id", game.id)
            .order("created_at", {
                ascending: false
            });

    if (guessesError) {
        throw guessesError;
    }

    const guesses = [];

    for (const guess of guessesData || []) {
        const guessPlayer = game.players?.find(
            (p) => p.id === guess.player_id
        );

        const guessedWrestler = await getWrestler(
            guess.wrestler_id
        );

        if (!guessedWrestler || !guessPlayer) {
            continue;
        }

        /**
         * La persona a la que se está intentando adivinar
         * es el jugador contrario.
         */
        const targetPlayer = game.players?.find(
            (p) => p.player_no !== guessPlayer.player_no
        );

        let result = null;

        if (targetPlayer?.secret_wrestler_id) {
            const targetWrestler = await getWrestler(
                targetPlayer.secret_wrestler_id
            );

            if (targetWrestler) {
                result = compare(
                    guessedWrestler,
                    targetWrestler
                );
            }
        }

        guesses.push({
            id: guess.id,
            playerNo: guessPlayer.player_no,
            name: guessedWrestler.name,
            image_url: guessedWrestler.image_url ?? null,
            local_image:
                guessedWrestler.local_image ?? null,
            result,
            createdAt: guess.created_at
        });
    }

    return {
        code: game.code,

        players: (game.players || []).map((player) => ({
            playerNo: player.player_no,
            name:
                player.name ||
                `Jugador ${player.player_no}`,
            ready: Boolean(
                player.secret_wrestler_id
            )
        })),

        status:
            bothSelected && game.status === "waiting"
                ? "playing"
                : game.status,

        playerNo: me.player_no,

        opponentConnected: Boolean(opponent),

        mySecret,

        opponentSecret,

        turnPlayer: bothSelected
            ? game.turn_player
            : null,

        winnerPlayer: game.winner_player,

        guesses
    };
}

/**
 * GET /api/rooms/[code]
 */
export async function GET(request, { params }) {
    try {
        const { code } = await params;

        const token =
            new URL(request.url)
                .searchParams
                .get("token");

        const game = await getGameByCode(code);

        if (!game) {
            return NextResponse.json(
                {
                    error: "Partida no encontrada"
                },
                {
                    status: 404
                }
            );
        }

        const me = findPlayer(game, token);

        if (!me) {
            return NextResponse.json(
                {
                    error: "Token de jugador inválido"
                },
                {
                    status: 401
                }
            );
        }

        const room = await roomForPlayer(
            game,
            me
        );

        return NextResponse.json(room);

    } catch (error) {
        console.error(
            "Error obteniendo partida:",
            error
        );

        return NextResponse.json(
            {
                error:
                    error.message ||
                    "Error obteniendo partida"
            },
            {
                status: 500
            }
        );
    }
}

/**
 * POST /api/rooms/[code]
 */
export async function POST(request, { params }) {
    try {
        const { code } = await params;

        const body = await request.json();

        const token = body?.token;
        const action = body?.action;
        const wrestlerId = body?.wrestlerId;

        const game = await getGameByCode(code);

        if (!game) {
            return NextResponse.json(
                {
                    error: "Partida no encontrada"
                },
                {
                    status: 404
                }
            );
        }

        const me = findPlayer(
            game,
            token
        );

        if (!me) {
            return NextResponse.json(
                {
                    error: "Token de jugador inválido"
                },
                {
                    status: 401
                }
            );
        }

        /**
         * ==========================================
         * SELECCIONAR LUCHADOR
         * ==========================================
         */
        if (action === "select") {

            if (game.status !== "waiting") {
                return NextResponse.json(
                    {
                        error:
                            "La selección ya terminó"
                    },
                    {
                        status: 409
                    }
                );
            }

            if (me.secret_wrestler_id) {
                return NextResponse.json(
                    {
                        error:
                            "Ya escogiste tu luchador"
                    },
                    {
                        status: 409
                    }
                );
            }

            const wrestler =
                await getWrestler(wrestlerId);

            if (!wrestler) {
                return NextResponse.json(
                    {
                        error:
                            "Luchador no encontrado"
                    },
                    {
                        status: 404
                    }
                );
            }

            if (wrestler.eligible === false) {
                return NextResponse.json(
                    {
                        error:
                            "Este luchador no está disponible"
                    },
                    {
                        status: 409
                    }
                );
            }

            /**
             * Guardamos el luchador secreto
             * solamente en Supabase.
             */
            const {
                error: updatePlayerError
            } = await supabaseAdmin
                .from("players")
                .update({
                    secret_wrestler_id:
                        wrestler.id
                })
                .eq("id", me.id);

            if (updatePlayerError) {
                throw updatePlayerError;
            }

            /**
             * Revisamos si ambos jugadores
             * ya eligieron.
             */
            const updatedGame =
                await getGameByCode(code);

            const bothReady =
                updatedGame.players?.length === 2 &&
                updatedGame.players.every(
                    (player) =>
                        Boolean(
                            player.secret_wrestler_id
                        )
                );

            if (bothReady) {
                const {
                    error: gameUpdateError
                } = await supabaseAdmin
                    .from("games")
                    .update({
                        status: "playing",
                        turn_player: 1
                    })
                    .eq(
                        "id",
                        updatedGame.id
                    );

                if (gameUpdateError) {
                    throw gameUpdateError;
                }
            }

            return NextResponse.json({
                success: true,
                ready: bothReady
            });
        }

        /**
         * ==========================================
         * ADIVINAR LUCHADOR
         * ==========================================
         */
        if (action === "guess") {

            if (game.status !== "playing") {
                return NextResponse.json(
                    {
                        error:
                            "La partida aún no está en juego"
                    },
                    {
                        status: 409
                    }
                );
            }

            if (
                game.turn_player !==
                me.player_no
            ) {
                return NextResponse.json(
                    {
                        error:
                            "No es tu turno"
                    },
                    {
                        status: 409
                    }
                );
            }

            const opponent =
                game.players?.find(
                    (player) =>
                        player.player_no !==
                        me.player_no
                );

            if (!opponent?.secret_wrestler_id) {
                return NextResponse.json(
                    {
                        error:
                            "El rival aún no ha escogido"
                    },
                    {
                        status: 409
                    }
                );
            }

            const guess =
                await getWrestler(
                    wrestlerId
                );

            const target =
                await getWrestler(
                    opponent.secret_wrestler_id
                );

            if (!guess || !target) {
                return NextResponse.json(
                    {
                        error:
                            "Luchador no encontrado"
                    },
                    {
                        status: 404
                    }
                );
            }

            if (guess.eligible === false) {
                return NextResponse.json(
                    {
                        error:
                            "Este luchador no está disponible"
                    },
                    {
                        status: 409
                    }
                );
            }

            const result =
                compare(
                    guess,
                    target
                );

            const won =
                Number(guess.id) ===
                Number(target.id);

            /**
             * Guardamos la jugada.
             */
            const {
                data: newGuess,
                error: guessError
            } = await supabaseAdmin
                .from("guesses")
                .insert({
                    game_id: game.id,
                    player_id: me.id,
                    wrestler_id: guess.id
                })
                .select()
                .single();

            if (guessError) {
                throw guessError;
            }

            /**
             * Si acertó:
             *   partida terminada
             *
             * Si falló:
             *   cambia el turno.
             */
            if (won) {

                const {
                    error: finishError
                } = await supabaseAdmin
                    .from("games")
                    .update({
                        status: "finished",
                        winner_player:
                            me.player_no
                    })
                    .eq(
                        "id",
                        game.id
                    );

                if (finishError) {
                    throw finishError;
                }

            } else {

                const nextPlayer =
                    me.player_no === 1
                        ? 2
                        : 1;

                const {
                    error: turnError
                } = await supabaseAdmin
                    .from("games")
                    .update({
                        turn_player:
                            nextPlayer
                    })
                    .eq(
                        "id",
                        game.id
                    );

                if (turnError) {
                    throw turnError;
                }
            }

            return NextResponse.json({
                id: newGuess.id,
                playerNo: me.player_no,
                name: guess.name,
                image_url:
                    guess.image_url ?? null,
                local_image:
                    guess.local_image ?? null,
                result,
                createdAt:
                    newGuess.created_at,
                won,
                winnerPlayer:
                    won
                        ? me.player_no
                        : null
            });
        }

        return NextResponse.json(
            {
                error: "Acción inválida"
            },
            {
                status: 400
            }
        );

    } catch (error) {

        console.error(
            "Error procesando partida:",
            error
        );

        return NextResponse.json(
            {
                error:
                    error.message ||
                    "Error procesando partida"
            },
            {
                status: 500
            }
        );
    }
}