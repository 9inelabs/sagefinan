import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { listRecentMessages } from "@/lib/messages/actions";
import { MessagesPanel } from "./MessagesPanel";

export default async function MessagesPage() {
  const profile = await getCurrentProfile();
  const initialMessages = await listRecentMessages();

  return (
    <PageShell title="Messages" subtitle="One shared room — everyone signed in can read and post">
      <MessagesPanel initialMessages={initialMessages} currentUserId={profile.id} />
    </PageShell>
  );
}
