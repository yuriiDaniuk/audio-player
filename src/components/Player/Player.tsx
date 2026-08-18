import React, { useCallback, useState, useRef, useLayoutEffect } from "react";
import SoundDriver from "./SoundDriver";

export default function Player() {
  const soundController = useRef<SoundDriver | null>(null);
  const waveContainerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // 1. Універсальна функція обробки файлу
  const processAudioFile = useCallback(async (audioFile: File) => {
    if (!audioFile.type.includes("audio")) {
      alert("Будь ласка, оберіть аудіофайл");
      return;
    }

    setLoading(true);
    const soundInstance = new SoundDriver(audioFile);

    try {
      if (waveContainerRef.current) {
        // Метод init просто декодує звук, йому ширина контейнера ще не потрібна
        await soundInstance.init(waveContainerRef.current);
        soundController.current = soundInstance;

        // Просто кажемо React, що файл готовий. Далі працюватиме useLayoutEffect!
        setHasFile(true);
      }
    } catch (err) {
      console.error("Помилка завантаження аудіо:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useLayoutEffect(() => {
    // Цей код виконається СИНХРОННО відразу після того, як React змінить DOM
    // (тобто контейнер отримає клас block і свою реальну ширину),
    // але ДО того, як браузер встигне намалювати це на екрані.
    if (hasFile && waveContainerRef.current && soundController.current) {
      soundController.current.drawChart();
    }
  }, [hasFile]); // Запускаємо ефект тільки тоді, коли змінюється стейт hasFile

  // 2. Обробник для звичайного кліку по кнопці (замість старого uploadAudio)
  const handleInputUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        processAudioFile(files[0]); // Передаємо файл в універсальну функцію
      }
    },
    [processAudioFile],
  );

  // Обробник: коли файл "завис" над контейнером
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Обов'язково! Інакше браузер просто відкриє файл на новій вкладці
    setIsDragging(true);
  }, []);

  // Обробник: коли мишка з файлом вийшла за межі контейнера
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Обробник: коли користувач відпустив кнопку миші (кинув файл)
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false); // Вимикаємо підсвітку

      const files = e.dataTransfer.files; // Дістаємо файли з події Drag & Drop
      if (files && files.length > 0) {
        processAudioFile(files[0]); // Віддаємо файл у нашу готову функцію!
      }
    },
    [processAudioFile],
  );

  const togglePlayer = useCallback(
    (type: "play" | "pause" | "stop") => () => {
      if (type === "play") {
        soundController.current?.play();
      } else if (type === "stop") {
        soundController.current?.pause(true);
      } else {
        soundController.current?.pause();
      }
    },
    [],
  );

  const onVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      soundController.current?.changeVolume(Number(event.target.value));
    },
    [],
  );

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-6 text-slate-100">
      {/* Секція завантаження файлу */}
      {!hasFile && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
      flex flex-col items-center justify-center w-full h-64 
      border-2 border-dashed rounded-xl transition-all duration-200 ease-in-out
      ${
        isDragging
          ? "border-green-500 bg-green-50/50 scale-[1.02]"
          : "border-gray-300 bg-gray-50 hover:bg-gray-100"
      }
    `}
        >
          <div className="text-center pointer-events-none">
            <p className="text-lg font-medium text-gray-600 mb-2">
              {isDragging ? "Кидайте файл сюди!" : "Перетягніть аудіофайл сюди"}
            </p>
            <p className="text-sm text-gray-400">або</p>
          </div>

          {/* Наш оновлений інпут для вибору файлу кліком */}
          <label className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg cursor-pointer hover:bg-green-700 transition-colors">
            Оберіть файл на комп'ютері
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleInputUpload}
            />
          </label>
        </div>
      )}

      {/* Індикатор завантаження */}
      {loading && (
        <div className="text-center py-8 text-sky-400 font-medium animate-pulse">
          Декодування та обробка треку...
        </div>
      )}

      {/* Контейнер графіка D3 */}
      <div
        ref={waveContainerRef}
        id="waveContainer"
        className={`w-full h-48 bg-slate-950/70 border border-slate-800/80 rounded-xl overflow-hidden ${
          !hasFile ? "hidden" : "block"
        }`}
      />

      {/* Панель керування */}
      {!loading && hasFile && (
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlayer("play")}
              className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg transition active:scale-95"
            >
              Play
            </button>

            <button
              type="button"
              onClick={togglePlayer("pause")}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition active:scale-95"
            >
              Pause
            </button>

            <button
              type="button"
              onClick={togglePlayer("stop")}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition active:scale-95"
            >
              Stop
            </button>
          </div>

          {/* Регулятор гучності */}
          <div className="flex items-center gap-3 bg-slate-800/50 px-4 py-2 rounded-lg border border-slate-700/40">
            <span className="text-xs font-medium text-slate-400">Volume</span>
            <input
              type="range"
              onChange={onVolumeChange}
              defaultValue={1}
              min={0}
              max={1}
              step={0.01}
              className="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}
