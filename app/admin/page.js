import { getSettings } from '@/lib/db';
import AdminPortal from '@/components/AdminPortal';

// The tab title follows the quiz title set in admin settings, so this page
// must be rendered per-request too.
export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: `Admin | ${getSettings().title}` };
}

export default function AdminPage() {
  return <AdminPortal />;
}
