import { getSettings } from '@/lib/db';
import OfficerPortal from '@/components/OfficerPortal';

// Settings (title/quarter) are editable at any time from /admin, so this
// page must be rendered per-request rather than baked in at build time.
export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: getSettings().title };
}

export default async function Home() {
  const settings = getSettings();
  return <OfficerPortal initialTitle={settings.title} initialQuarter={settings.quarter} />;
}
