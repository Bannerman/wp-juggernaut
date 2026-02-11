import { NextRequest } from 'next/server';
import { fullSync, incrementalSync } from '@/lib/sync';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const incremental = body.incremental === true;
  const stream = body.stream === true;

  // Non-streaming path (backwards compatible)
  if (!stream) {
    try {
      console.log(`Starting ${incremental ? 'incremental' : 'full'} sync...`);
      const result = incremental ? await incrementalSync() : await fullSync();
      console.log('Sync result:', JSON.stringify(result));

      if (result.errors.length > 0) {
        console.error('Sync errors:', result.errors);
        return Response.json(
          { ...result, error: result.errors.join(', ') },
          { status: 207 }
        );
      }

      return Response.json(result);
    } catch (error) {
      console.error('Sync error:', error);
      return Response.json({ error: `Sync failed: ${error}` }, { status: 500 });
    }
  }

  // Streaming SSE path for progress tracking
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        console.log(`Starting ${incremental ? 'incremental' : 'full'} sync (streaming)...`);

        const onProgress = (phase: string, progress: number, detail?: string): void => {
          // Taxonomy phase is 0-5%, resource phases are 5-100%
          const overall = phase === 'taxonomies'
            ? progress * 0.05
            : 0.05 + progress * 0.95;
          send('progress', { phase, progress: Math.min(overall, 1), detail });
        };

        const result = incremental
          ? await incrementalSync()
          : await fullSync(onProgress);

        console.log('Sync result:', JSON.stringify(result));
        send('complete', result);
      } catch (error) {
        console.error('Sync error:', error);
        send('error', { error: `Sync failed: ${error}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
