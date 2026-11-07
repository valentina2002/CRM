import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="rounded-[10px] border bg-card p-8 text-center">
      <h1 className="text-lg font-bold">No encontramos esta página</h1>
      <p className="mt-1 text-muted-foreground">Puede que el contacto o el registro se haya eliminado.</p>
      <Button asChild className="mt-4">
        <Link href="/contactos">Ir a Contactos</Link>
      </Button>
    </div>
  );
}
