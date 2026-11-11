export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Movie Memory</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Tell us your favorite movie and get a fun fact about it.
      </p>
    </main>
  );
}
