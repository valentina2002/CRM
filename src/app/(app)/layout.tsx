import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { db } from "@/lib/db";
import { getUser, requireUser } from "@/lib/session";
import { logout } from "./actions";

/**
 * App shell. The sidebar is static (prerendered); the parts that read the session or the DB
 * (unread badge, user footer) stream in behind their own Suspense boundaries (Cache Components).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col min-[900px]:flex-row">
      <Sidebar
        conversationsBadge={
          <Suspense fallback={null}>
            <UnreadBadge />
          </Suspense>
        }
        footer={
          <Suspense fallback={<div className="h-[52px]" />}>
            <UserFooter />
          </Suspense>
        }
        mobileSignOut={<SignOutButton compact />}
      />
      <main className="min-w-0 flex-1 px-3.5 pt-[18px] pb-10 min-[900px]:px-[30px] min-[900px]:pt-[26px]">{children}</main>
    </div>
  );
}

async function UnreadBadge() {
  if (!(await getUser())) return null;
  const result = await db.conversation.aggregate({ _sum: { unread: true } }).catch(() => null);
  const unread = result?._sum.unread ?? 0;
  if (!unread) return null;
  return (
    <span className="ml-auto rounded-[10px] bg-sidebar-primary px-[7px] py-px text-[11px] font-semibold text-white" aria-label={`${unread} sin leer`}>
      {unread}
    </span>
  );
}

async function UserFooter() {
  const user = await requireUser();
  return (
    <>
      <div className="truncate text-sidebar-foreground">{user.name}</div>
      <div className="truncate">{user.email}</div>
      <SignOutButton />
    </>
  );
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logout}>
      {compact ? (
        <button type="submit" className="grid size-8 cursor-pointer place-items-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut className="size-4" />
        </button>
      ) : (
        <button type="submit" className="mt-2 w-full cursor-pointer rounded-[7px] border border-[#2c3d5e] px-2.5 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent">
          Cerrar sesión
        </button>
      )}
    </form>
  );
}
