require('dotenv').config({
    path: '.env.local'
});

const fs = require('fs');
const path = require('path');

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL');
}

if (!serviceRoleKey) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(
    supabaseUrl,
    serviceRoleKey
);

const filePath = path.join(
    process.cwd(),
    'data',
    'wrestlers.json'
);

const wrestlers = JSON.parse(
    fs.readFileSync(filePath, 'utf8')
);

async function importWrestlers() {
    console.log(`Encontrados ${wrestlers.length} luchadores.`);

    const rows = wrestlers.map((wrestler) => ({
        slug: wrestler.id,
        name: wrestler.name,
        real_name: wrestler.real_name || null,

        aliases: Array.isArray(wrestler.aliases)
            ? wrestler.aliases.join(', ')
            : wrestler.aliases || null,

        gender: wrestler.gender || null,
        nationality: wrestler.nationality || null,

        promotion: wrestler.primary_promotion || null,
        brand: wrestler.brand || null,

        debut_year: wrestler.start_year || null,
        status: wrestler.status || null,

        height_cm: wrestler.height_cm || null,
        weight_kg: wrestler.weight_kg || null,

        alignment: wrestler.alignment || null,
        wrestling_style: wrestler.style || null,
        category: wrestler.category || null,

        finisher: wrestler.finisher || null,

        championships: Array.isArray(wrestler.championships)
            ? wrestler.championships.join(', ')
            : wrestler.championships || null,

        royal_rumble_wins: wrestler.royal_rumble_winner
            ? 1
            : 0,

        world_champion: wrestler.world_champion || false,

        image_url: wrestler.image_url || null,
        local_image: wrestler.local_image || null,

        eligible: wrestler.eligible !== false,

        birth_date: wrestler.birth_date || null,

        teams: Array.isArray(wrestler.teams)
            ? wrestler.teams.join(', ')
            : wrestler.teams || null,

        image_source: wrestler.image_source || null,

        hall_of_fame: wrestler.hall_of_fame || false
    }));

    const { data, error } = await supabase
        .from('wrestlers')
        .upsert(rows, {
            onConflict: 'slug'
        })
        .select('id, slug, name');

    if (error) {
        console.error('Error importando luchadores:');
        console.error(error);
        process.exit(1);
    }

    console.log(
        `Importación completada: ${data.length} luchadores.`
    );
}

importWrestlers();