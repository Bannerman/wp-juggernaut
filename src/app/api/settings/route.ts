import { NextResponse } from 'next/server';
import { getAllSettings, setSetting, resetSetting, getDefaultPromptTemplate } from '@/lib/settings';

export async function GET() {
  try {
    const settings = getAllSettings();
    const defaultTemplate = getDefaultPromptTemplate();
    return NextResponse.json({ settings, defaultTemplate });
  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    if (body.ai_prompt_template !== undefined) {
      setSetting('ai_prompt_template', body.ai_prompt_template);
    }

    const settings = getAllSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key === 'ai_prompt_template') {
      const defaultValue = resetSetting('ai_prompt_template');
      return NextResponse.json({ value: defaultValue });
    }

    return NextResponse.json({ error: 'Unknown setting key' }, { status: 400 });
  } catch (error) {
    console.error('Settings reset error:', error);
    return NextResponse.json({ error: 'Failed to reset setting' }, { status: 500 });
  }
}
