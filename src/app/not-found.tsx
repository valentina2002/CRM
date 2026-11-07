import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <h1 className="text-lg font-bold">Página no encontrada</h1>
        <Link href="/tablero" className="mt-2 inline-block text-primary hover:underline">
          Volver al tablero
        </Link>
      </div>
    </main>
  );
}
