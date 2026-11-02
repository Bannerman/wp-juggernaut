import { NextRequest, NextResponse } from 'next/server';
import {
  listPlannerTermsGrouped,
  createPlannerTerm,
} from '@/lib/plugins/bundled/content-planner/queries';
import { resolvePlannerClassification } from '@/lib/plugins/bundled/content-planner/classification';
import { ensureProfileLoaded, getProfileManager } from '@/lib/profiles';

// Reads user files / local DB at request time: never prerender at build
// (a build would otherwise bake one machine's data into the output).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // `classification` tells the planner UI which taxonomy backs each
    // classification slot for the active profile.
    let classification;
    try {
      ensureProfileLoaded();
      const manager = getProfileManager();
      classification = resolvePlannerClassification(
        manager.getPluginSettings('content-planner'),
        manager.getTaxonomyLabels(),
      );
    } catch {
      classification = resolvePlannerClassification(undefined);
    }
    return NextResponse.json({ terms: listPlannerTermsGrouped(), classification });
  } catch (error) {
    console.error('[planner] listPlannerTerms failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list planner terms' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.taxonomy || typeof body.taxonomy !== 'string' || !body.taxonomy.trim()) {
      return NextResponse.json({ error: 'taxonomy is required' }, { status: 400 });
    }
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const term = createPlannerTerm({
      taxonomy: body.taxonomy.trim(),
      name: body.name.trim(),
      slug: typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : undefined,
      parent_id: typeof body.parent_id === 'number' ? body.parent_id : undefined,
    });
    if (!term) {
      return NextResponse.json(
        { error: `A planner term "${body.name.trim()}" already exists for taxonomy "${body.taxonomy.trim()}"` },
        { status: 409 },
      );
    }
    return NextResponse.json({ term }, { status: 201 });
  } catch (error) {
    console.error('[planner] createPlannerTerm failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create planner term' },
      { status: 500 },
    );
  }
}
