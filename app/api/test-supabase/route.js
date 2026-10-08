import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    const { data, error, count } = await supabase
        .from('wrestlers')
        .select('id, name', { count: 'exact' })
        .eq('eligible', true);

    if (error) {
        console.error('Error Supabase:', error);

        return NextResponse.json(
            {
                success: false,
                error: error.message
            },
            {
                status: 500
            }
        );
    }

    return NextResponse.json({
        success: true,
        count,
        data
    });
}