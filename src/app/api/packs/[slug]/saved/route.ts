import { recordUsage } from '@/lib/web/data';

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (/^[a-z0-9-]{3,60}$/.test(slug)) await recordUsage('pack_saved', slug);
  return new Response(null, { status: 204 });
}
