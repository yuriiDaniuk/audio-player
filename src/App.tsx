import Player from './components/Player/Player';

export default function App() {
  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-100 text-center mb-6 tracking-tight">
          Web Audio Player
        </h1>
        <Player />
      </div>
    </main>
  );
}